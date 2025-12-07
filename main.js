import handler_ImageMagick from "./handlers/ImageMagick.js";
import handler_FFmpeg from "./handlers/FFmpeg.js";

const handlers = [
  handler_ImageMagick,
  handler_FFmpeg
];

let selectedFile;

const fileInput = document.querySelector("#file-input");
const fileSelectArea = document.querySelector("#file-area");
const convertButton = document.querySelector("#convert-button");

const inputList = document.querySelector("#from-list");
const outputList = document.querySelector("#to-list");
const inputSearch = document.querySelector("#search-from");
const outputSearch = document.querySelector("#search-to");

const searchHandler = function (event) {
  const string = event.target.value;
  const list = event.target.parentElement.querySelector(".format-list");
  for (const button of Array.from(list.children)) {
    if (!button.textContent.includes(string)) {
      button.style.display = "none";
    } else {
      button.style.display = "";
    }
  }
};

inputSearch.oninput = searchHandler;
outputSearch.oninput = searchHandler;

window.selectFile = function () {
  fileInput.click();
};

const fileSelectHandler = function (event) {

  let file;

  if ("dataTransfer" in event) {
    const item = event.dataTransfer?.items?.[0];
    if (item.kind !== "file") return;
    event.preventDefault();
    file = item.getAsFile();
  } else {
    file = event.target.files?.[0];
  }

  if (!file) return;
  selectedFile = file;

  fileSelectArea.innerHTML = `<h2>${file.name}</h2>`;

  const mimeType = file.type;
  const fileExtension = file.name.split(".").pop()

  inputSearch.value = mimeType || fileExtension;
  searchHandler({ target: inputSearch });

  if (!mimeType) return;

  for (const button of Array.from(inputList.children)) {
    if (button.getAttribute("mime-type") === mimeType) {
      button.click();
      break;
    }
  }

};

fileInput.addEventListener("change", fileSelectHandler);
window.addEventListener("drop", fileSelectHandler);
window.addEventListener("dragover", (e) => e.preventDefault());

const initPromises = [];
for (const handler of handlers) {
  initPromises.push(handler.init());
}

const allOptions = [];
Promise.all(initPromises).then(() => {

  for (const handler of handlers) {
    for (const format of handler.supportedFormats) {

      if (!format.mime) continue;

      allOptions.push({ format, handler });

      const newOption = document.createElement("button");
      newOption.setAttribute("format-index", allOptions.length - 1);
      newOption.setAttribute("mime-type", format.mime);
      newOption.appendChild(document.createTextNode(format.name + (format.mime ? ` (${format.mime})` : "")));

      const clickHandler = (event) => {
        const previous = event.target.parentElement.getElementsByClassName("selected")?.[0];
        if (previous) previous.className = "";
        event.target.className = "selected";
        const allSelected = document.getElementsByClassName("selected");
        if (allSelected.length === 2) {
          convertButton.className = "";
        } else {
          convertButton.className = "disabled";
        }
      };

      if (format.from) {
        const clone = newOption.cloneNode(true);
        clone.onclick = clickHandler;
        inputList.appendChild(clone);
      }
      if (format.to) {
        const clone = newOption.cloneNode(true);
        clone.onclick = clickHandler;
        outputList.appendChild(clone);
      }

    }
  }

  searchHandler({ target: inputSearch });
  searchHandler({ target: outputSearch });

  document.querySelector("#popup-bg").style.display = "none";
  document.querySelector("#popup").style.display = "none";

});

window.convertSelection = async function () {

  const inputFile = selectedFile;

  if (!inputFile) {
    return alert("Select an input file.");
  }

  const inputButton = document.querySelector("#from-list .selected");
  if (!inputButton) return alert("Specify input file format.");

  const outputButton = document.querySelector("#to-list .selected");
  if (!outputButton) return alert("Specify output file format.");

  const inputOption = allOptions[Number(inputButton.getAttribute("format-index"))];
  const inputFormat = inputOption.format;
  const outputOption = allOptions[Number(outputButton.getAttribute("format-index"))];
  const outputFormat = outputOption.format;

  let outputData;
  try {
    outputData = await inputOption.handler.doConvert(inputFile, inputFormat, outputFormat);
  } catch (e) {
    alert(e.message);
    return;
  }

  const blob = new Blob([outputData], {type: outputFormat.mime} );
  const link = document.createElement("a");
  link.href = window.URL.createObjectURL(blob);
  link.download = inputFile.name.split(".")[0] + "." + outputFormat.extension;
  link.click();

}
