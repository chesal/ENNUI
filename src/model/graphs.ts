import * as tfvis from '@tensorflow/tfjs-vis';
import * as tf from '@tensorflow/tfjs';

// const statusElement = document.getElementById('status');
// const messageElement = document.getElementById('message');

// export function logStatus(message) {
//   statusElement.innerText = message;
// }

// export function trainingLog(message) {
//   messageElement.innerText = `${message}\n`;
//   console.log(message);
// }

/**
 * Show predictions on a number of test examples.
 *
 * @param {tf.Model} model The model to be used for making the predictions.
 */
export async function showPredictions(model, data) {
  const testExamples = 40;
  const examples = data.getTestData(testExamples);

  // Code wrapped in a tf.tidy() function callback will have their tensors freed
  // from GPU memory after execution without having to call dispose().
  // The tf.tidy callback runs synchronously.
  tf.tidy(() => {
    const output = model.predict(examples.xs);

    // tf.argMax() returns the indices of the maximum values in the tensor along
    // a specific axis. Categorical classification tasks like this one often
    // represent classes as one-hot vectors. One-hot vectors are 1D vectors with
    // one element for each output class. All values in the vector are 0
    // except for one, which has a value of 1 (e.g. [0, 0, 0, 1, 0]). The
    // output from model.predict() will be a probability distribution, so we use
    // argMax to get the index of the vector element that has the highest
    // probability. This is our prediction.
    // (e.g. argmax([0.07, 0.1, 0.03, 0.75, 0.05]) == 3)
    // dataSync() synchronously downloads the tf.tensor values from the GPU so
    // that we can use them in our normal CPU JavaScript code
    // (for a non-blocking version of this function, use data()).
    const axis = 1;
    const labels = Array.from(examples.labels.argMax(axis).dataSync());
    const predictions = Array.from(output.argMax(axis).dataSync());

    showTestResults(examples, predictions, labels);
  });
}

export function showTestResults(batch, predictions, labels) {
  const imagesElement = document.getElementById('images');
  console.log("called show test results")
  const testExamples = batch.xs.shape[0];
  console.log(testExamples)
  imagesElement.innerHTML = '';
  for (let i = 0; i < testExamples; i++) {
    const image = batch.xs.slice([i, 0], [1, batch.xs.shape[1]]);

    const div = document.createElement('div');
    div.className = 'pred-container';

    const canvas = document.createElement('canvas');
    canvas.className = 'prediction-canvas';
    draw(image.flatten(), canvas);

    const pred = document.createElement('div');

    const prediction = predictions[i];
    const label = labels[i];
    const correct = prediction === label;

    pred.className = `pred ${(correct ? 'pred-correct' : 'pred-incorrect')}`;
    pred.innerText = `pred: ${prediction}`;

    div.appendChild(pred);
    div.appendChild(canvas);

    imagesElement.appendChild(div);
  }
}

// const lossLabelElement = document.getElementById('loss-label');
// const accuracyLabelElement = document.getElementById('accuracy-label');
const lossValues = [[], []];
export function plotLoss(batch, loss, set) {
  const series = set === 'train' ? 0 : 1;
  lossValues[series].push({x: batch, y: loss});
  const lossContainer = document.getElementById('loss-canvas');
  tfvis.render.linechart(
      {values: lossValues, series: ['train', 'validation']}, lossContainer, {
        xLabel: 'Batch #',
        yLabel: 'Loss',
        width: 400,
        height: 300,
      });
  // lossLabelElement.innerText = `last loss: ${loss.toFixed(3)}`;
}

const accuracyValues = [[], []];
export function plotAccuracy(epochs, accuracy, set) {
  const accuracyContainer = document.getElementById('accuracy-canvas');
  const series = set === 'train' ? 0 : 1;
  accuracyValues[series].push({x: epochs, y: accuracy});
  tfvis.render.linechart(
      {values: accuracyValues, series: ['train', 'validation']},
      accuracyContainer, {
        xLabel: 'Batch #',
        yLabel: 'Accuracy',
        width: 400,
        height: 300,
      });
  // accuracyLabelElement.innerText =
      // `last accuracy: ${(accuracy * 100).toFixed(1)}%`;
}

export function draw(image, canvas) {
  const [width, height] = [28, 28];
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imageData = new ImageData(width, height);
  const data = image.dataSync();
  for (let i = 0; i < height * width; ++i) {
    const j = i * 4;
    imageData.data[j + 0] = data[i] * 255;
    imageData.data[j + 1] = data[i] * 255;
    imageData.data[j + 2] = data[i] * 255;
    imageData.data[j + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
}

// export function getModelTypeId() {
//   return document.getElementById('model-type').value;
// }

// export function getTrainEpochs() {
//   return Number.parseInt(document.getElementById('train-epochs').value);
// }

// export function setTrainButtonCallback(callback) {
//   const trainButton = document.getElementById('train');
//   const modelType = document.getElementById('model-type');
//   trainButton.addEventListener('click', () => {
//     trainButton.setAttribute('disabled', true);
//     modelType.setAttribute('disabled', true);
//     callback();
//   });
// }