// BirdNET inference worker (runs entirely in the browser with TensorFlow.js).
// Adapted from https://github.com/georg95/birdnet-web (MelSpecLayerSimple + custom STFT kernel).
// All model/label paths are relative to this worker file so the site works under
// any base path (e.g. a GitHub Pages project subpath).
importScripts('vendor/tf.min.js')

// The model weighs ~60 MB, so every network fetch (model shards, geo model,
// labels) goes through the Cache API: the first visit downloads and stores it,
// later visits load it from disk without touching the network. Bump the cache
// name if the model files ever change.
const CACHE_NAME = 'birdnet-model-v1'

// Every asset goes through cachedFetch, so counting completed calls gives the
// UI a load percentage that works both for network downloads and cache reads.
const TOTAL_FETCHES = 19 // 1 model.json + 13 weight shards + 1 area model.json + 2 area shards + 2 label files
let fetchesDone = 0

async function openCache() {
    try { return await caches.open(CACHE_NAME) }
    catch (_) { return null } // Cache API unavailable (e.g. some private modes)
}

async function cachedFetch(url, init) {
    const cache = await openCache()
    let res = cache ? await cache.match(url) : null
    if (!res) {
        res = await fetch(url, init)
        if (cache && res.ok) {
            try { await cache.put(url, res.clone()) }
            catch (_) { /* storage quota exceeded — keep serving from network */ }
        }
    }
    fetchesDone += 1
    postMessage({ message: 'fetch_progress', done: fetchesDone, total: TOTAL_FETCHES })
    return res
}

async function isModelCached() {
    const cache = await openCache()
    return !!(cache && await cache.match('models/birdnet/model.json'))
}

main()
async function main() {
    await tf.setBackend('webgl')
    postMessage({ message: 'cache_status', cached: await isModelCached() })
    postMessage({ message: 'load_model' })
    const BirdNetJS = await predictModel()
    postMessage({ message: 'warmup' })
    await BirdNetJS.warmup()
    postMessage({ message: 'load_geomodel' })
    const areaModel = await tf.loadGraphModel('models/birdnet/area-model/model.json', { fetchFunc: cachedFetch })
    postMessage({ message: 'load_labels' })
    // en_us.txt gives "Scientific_English name"; es.txt gives "Scientific_Nombre en español".
    const birdsSci = (await cachedFetch('models/birdnet/labels/en_us.txt').then(r => r.text())).split('\n')
    const birdsEs  = (await cachedFetch('models/birdnet/labels/es.txt').then(r => r.text())).split('\n')
    const birds = new Array(birdsSci.length)
    for (let i = 0; i < birdsSci.length; i++) {
        birds[i] = {
            geoscore: 1,
            sciName: (birdsSci[i].split('_')[0] || '').trim(),
            enName: (birdsSci[i].split('_')[1] || '').trim(),
            name: ((birdsEs[i] || '').split('_')[1] || birdsSci[i].split('_')[1] || '').trim(),
        }
    }
    postMessage({ message: 'loaded' })
    const MIN_AUDIO_CONFIDENCE = 0.03
    const MIN_AREA_CONFIDENCE = 0.0
    onmessage = async function({ data }) {
        if (data.message === 'predict') {
            const predictionList = await BirdNetJS.predict(tf.tensor(data.pcmAudio, [data.pcmAudio.length / 144000, 144000]))
            const prediction = []
            for (let batch = 0; batch < predictionList.length; batch++) {
                for (let i = 0; i < predictionList[batch].length; i++) {
                    const confidence = predictionList[batch][i]
                    if (confidence > MIN_AUDIO_CONFIDENCE && birds[i].geoscore > MIN_AREA_CONFIDENCE) {
                        prediction.push({ ...birds[i], batch, confidence })
                    }
                }
            }
            postMessage({ message: 'predict', prediction })
        }
        if (data.message === 'area-scores') {
            tf.engine().startScope()
            const startOfYear = new Date(new Date().getFullYear(), 0, 1);
            startOfYear.setDate(startOfYear.getDate() + (1 - (startOfYear.getDay() % 7)))
            const week = Math.round((new Date() - startOfYear) / 604800000) + 1
            const areaTensor = tf.tensor([[data.latitude, data.longitude, week]])
            const areaScores = await areaModel.predict(areaTensor).data()
            tf.engine().endScope()
            for (let i = 0; i < birds.length; i++) {
                birds[i].geoscore = areaScores[i]
            }
            postMessage({ message: 'area-scores' })
        }
    }
}

async function predictModel() {
    const BirdNetJS = await tf.loadLayersModel('models/birdnet/model.json', { fetchFunc: cachedFetch })
    async function predict(signal) {
        const resTensor = BirdNetJS.predict(signal)
        signal.dispose()
        const result = await resTensor.array()
        resTensor.dispose()
        return result
    }
    return {
        async warmup() {
            await predict(tf.zeros([1, 144000]))
        },
        predict
    }
}

class MelSpecLayerSimple extends tf.layers.Layer {
    constructor(config) {
        super(config)
        this.sampleRate = config.sampleRate
        this.specShape = config.specShape
        this.frameStep = config.frameStep
        this.frameLength = config.frameLength
        this.melFilterbank = tf.tensor2d(config.melFilterbank)
    }
    build(inputShape) {
        this.magScale = this.addWeight(
            'magnitude_scaling',
            [],
            'float32',
            tf.initializers.constant({ value: 1.23 })
        );
        super.build(inputShape)
    }
    computeOutputShape(inputShape) {
        return [inputShape[0], this.specShape[0], this.specShape[1], 1];
    }
    call(inputs) {
        return tf.tidy(() => {
        inputs = inputs[0]
        return tf.stack(inputs.split(inputs.shape[0]).map((input) => {
                let spec = input.squeeze()
                spec = tf.sub(spec, tf.min(spec, -1, true))
                spec = tf.div(spec, tf.max(spec, -1, true).add(0.000001))
                spec = tf.sub(spec, 0.5)
                spec = tf.mul(spec, 2.0)
                spec = tf.engine().runKernel('STFT', { signal: spec, frameLength: this.frameLength, frameStep: this.frameStep })
                spec = tf.matMul(spec, this.melFilterbank)
                spec = spec.pow(2.0)
                spec = spec.pow(tf.div(1.0, tf.add(1.0, tf.exp(this.magScale.read()))))
                spec = tf.reverse(spec, -1)
                spec = tf.transpose(spec)
                spec = spec.expandDims(-1)
                return spec;
            }))
        })
    }
    static get className() { return 'MelSpecLayerSimple' }
}
tf.serialization.registerClass(MelSpecLayerSimple)

tf.registerKernel({
    kernelName: 'STFT',
    backendName: 'webgl',
    kernelFunc: ({ backend, inputs: { signal, frameLength, frameStep } }) => {
        const innerDim = frameLength / 2
        const batch = (signal.size - frameLength + frameStep) / frameStep | 0
        let currentTensor = backend.runWebGLProgram({
            variableNames: ['x'],
            outputShape: [batch, frameLength],
            userCode: `
            void main() {
                ivec2 coords = getOutputCoords();
                int p = coords[1] % ${innerDim};
                int k = 0;
                for (int i = 0; i < ${Math.log2(innerDim)}; ++i) {
                    if ((p & (1 << i)) != 0) { k |= (1 << (${Math.log2(innerDim) - 1} - i)); }
                }
                int i = 2 * k;
                if (coords[1] >= ${innerDim}) {
                    i = 2 * (k % ${innerDim}) + 1;
                }
                int q = coords[0] * ${frameLength} + i;
                float val = getX((q / ${frameLength}) * ${frameStep} + q % ${frameLength});
                float cosArg = ${2.0 * Math.PI / frameLength} * float(q);
                float mul = 0.5 - 0.5 * cos(cosArg);
                setOutput(val * mul);
            }`
        }, [signal], 'float32')
        for (let len = 1; len < innerDim; len *= 2) {
            let prevTensor = currentTensor
            currentTensor = backend.runWebGLProgram({
                variableNames: ['x'],
                outputShape: [batch, innerDim * 2],
                userCode: `void main() {
                    ivec2 coords = getOutputCoords();
                    int batch = coords[0];
                    int i = coords[1];
                    int k = i % ${innerDim};
                    int isHigh = (k % ${len * 2}) / ${len};
                    int highSign = (1 - isHigh * 2);
                    int baseIndex = k - isHigh * ${len};
                    float t = ${Math.PI / len} * float(k % ${len});
                    float a = cos(t);
                    float b = sin(-t);
                    float oddK_re = getX(batch, baseIndex + ${len});
                    float oddK_im = getX(batch, baseIndex + ${len + innerDim});
                    if (i < ${innerDim}) { // real
                        float evenK_re = getX(batch, baseIndex);
                        setOutput(evenK_re + (oddK_re * a - oddK_im * b) * float(highSign));
                    } else { // imaginary
                        float evenK_im = getX(batch, baseIndex + ${innerDim});
                        setOutput(evenK_im + (oddK_re * b + oddK_im * a) * float(highSign));
                    }
                }`
            }, [currentTensor], 'float32')
            backend.disposeIntermediateTensorInfo(prevTensor)
        }
        const real = backend.runWebGLProgram({
            variableNames: ['x'],
            outputShape: [batch, innerDim + 1],
            userCode: `void main() {
                ivec2 coords = getOutputCoords();
                int batch = coords[0];
                int i = coords[1];
                int zI = i % ${innerDim};
                int conjI = (${innerDim} - i) % ${innerDim};
                float Zk0 = getX(batch, zI);
                float Zk1 = getX(batch, zI+${innerDim});
                float Zk_conj0 = getX(batch, conjI);
                float Zk_conj1 = -getX(batch, conjI+${innerDim});
                float t = ${-2 * Math.PI} * float(i) / float(${innerDim * 2});
                float diff0 = Zk0 - Zk_conj0;
                float diff1 = Zk1 - Zk_conj1;
                float result = (Zk0 + Zk_conj0 + cos(t) * diff1 + sin(t) * diff0) * 0.5;
                setOutput(result);
            }`
        }, [currentTensor], 'float32')
        backend.disposeIntermediateTensorInfo(currentTensor)
        return real
    }
})

tf.registerKernel({
    kernelName: 'STFT',
    backendName: 'webgpu',
    kernelFunc: ({ backend, inputs: { signal, frameLength, frameStep } }) => {
        const workgroupSize = [64, 1, 1]
        const innerDim = frameLength / 2
        const batch = (signal.size - frameLength + frameStep) / frameStep | 0
        let currentTensor = backend.runWebGPUProgram({
            variableNames: ['x'],
            workgroupSize: [64, 1, 1],
            outputShape: [batch, innerDim * 2],
            shaderKey: `fft_permut_${innerDim}_${frameStep}`,
            dispatchLayout: { x: [0, 1] },
            dispatch: [Math.ceil(batch * innerDim * 2 / workgroupSize[0]), 1, 1],
            getUserCode: () => `
            fn main(index: i32) {
                let batch = index / ${innerDim * 2};
                let p = index % ${innerDim};
                var k = 0;
                for (var i: u32 = 0; i < ${Math.log2(innerDim)}; i = i + 1) {
                    if ((p & (1 << i)) != 0) { k |= (1 << (${Math.log2(innerDim) - 1} - i)); }
                }
                var i = 2 * k;
                if (index % ${innerDim * 2} >= ${innerDim}) {
                    i = 2 * (k % ${innerDim}) + 1;
                }
                var q = batch * ${frameLength} + i;
                var val = getX((q / ${frameLength}) * ${frameStep} + q % ${frameLength});
                var cosArg = ${2.0 * Math.PI / frameLength} * f32(q);
                var mul = 0.5 - 0.5 * cos(cosArg);
                setOutputAtIndex(index, val * mul);
            }`
        }, [signal], 'float32')
        for (let len = 1; len < innerDim; len *= 2) {
            let prevTensor = currentTensor
            currentTensor = backend.runWebGPUProgram({
                variableNames: ['x'],
                workgroupSize,
                outputShape: [batch, innerDim * 2],
                shaderKey: `fft_step_${innerDim}_${len}`,
                dispatchLayout: { x: [0, 1] },
                dispatch: [Math.ceil(batch * innerDim / workgroupSize[0]), 1, 1],
                getUserCode: () => {
                    return `fn main(index: i32) {
                        let batch = index / ${innerDim};
                        var i = index % ${innerDim};
                        let outIndexReal = batch * ${innerDim * 2} + i;
                        let outIndexImag = outIndexReal + ${innerDim};
                        let isHigh = (i % (${len} * 2)) / ${len};
                        let highSign = (1 - isHigh * 2);
                        let baseIndex = i - isHigh * ${len};
                        let t = ${Math.PI / len} * f32(i % ${len});
                        let a = cos(t);
                        let b = sin(-t);
                        let oddK_re = getX(batch, baseIndex + ${len});
                        let oddK_im = getX(batch, baseIndex + ${len} + ${innerDim});
                        let evenK_re = getX(batch, baseIndex);
                        setOutputAtIndex(outIndexReal, (evenK_re + (oddK_re * a - oddK_im * b) * f32(highSign)));
                        let evenK_im = getX(batch, baseIndex + ${innerDim});
                        setOutputAtIndex(outIndexImag, (evenK_im + (oddK_re * b + oddK_im * a) * f32(highSign)));
                    }`
                }
            }, [currentTensor], 'float32')
            backend.disposeData(prevTensor.dataId)
        }
        const real = backend.runWebGPUProgram({
            variableNames: ['x'],
            workgroupSize,
            outputShape: [batch, innerDim + 1],
            shaderKey: `rfft_reassemble_${innerDim}_real`,
            dispatchLayout: { x: [0, 1] },
            dispatch: [Math.ceil((batch * (innerDim + 1)) / workgroupSize[0]), 1, 1],
            getUserCode: () => `fn main(index: i32) {
                let batch = index / ${innerDim + 1};
                let i = index % ${innerDim + 1};
                let k = i;
                let zI = k % ${innerDim};
                let conjI = (${innerDim} - k) % ${innerDim};
                let Zk0 = getX(batch, zI);
                let Zk1 = getX(batch, zI+${innerDim});
                let Zk_conj0 = getX(batch, conjI);
                let Zk_conj1 = -getX(batch, conjI+${innerDim});
                let t = ${-2 * Math.PI} * f32(k) / f32(${innerDim * 2});
                let diff0 = Zk0 - Zk_conj0;
                let diff1 = Zk1 - Zk_conj1;
                let result = (Zk0 + Zk_conj0 + cos(t) * diff1 + sin(t) * diff0) * 0.5;
                setOutputAtIndex(index, result);
            }`
        }, [currentTensor], 'float32')
        backend.disposeData(currentTensor.dataId)
        return real
    }
})
