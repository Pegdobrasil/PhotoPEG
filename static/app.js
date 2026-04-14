const form = document.getElementById("uploadForm");
const filesInput = document.getElementById("files");
const fileName = document.getElementById("fileName");
const statusBox = document.getElementById("status");
const submitBtn = document.getElementById("submitBtn");
const clearBtn = document.getElementById("clearBtn");

const dropZone = document.getElementById("dropZone");

const resultBox = document.getElementById("resultBox");
const resultText = document.getElementById("resultText");
const zipDownloadBtn = document.getElementById("zipDownloadBtn");

const galleryBox = document.getElementById("galleryBox");
const galleryGrid = document.getElementById("galleryGrid");

const loadingOverlay = document.getElementById("loadingOverlay");
const loadingSubtitle = document.getElementById("loadingSubtitle");
const loadingCurrentStep = document.getElementById("loadingCurrentStep");
const loadingPercent = document.getElementById("loadingPercent");
const loadingBarFill = document.getElementById("loadingBarFill");
const loadingSteps = Array.from(document.querySelectorAll(".loading-step"));

const editorModal = document.getElementById("editorModal");
const editorTitle = document.getElementById("editorTitle");
const closeEditorBtn = document.getElementById("closeEditorBtn");
const saveBtn = document.getElementById("saveBtn");
const resetBtn = document.getElementById("resetBtn");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const editorDownloadBtn = document.getElementById("editorDownloadBtn");

const editorCanvas = document.getElementById("editorCanvas");
const editorCtx = editorCanvas.getContext("2d");

const toolModeButtons = Array.from(document.querySelectorAll(".tool-mode"));

const lightRange = document.getElementById("lightRange");
const brightnessRange = document.getElementById("brightnessRange");
const contrastRange = document.getElementById("contrastRange");
const temperatureRange = document.getElementById("temperatureRange");
const sharpnessRange = document.getElementById("sharpnessRange");
const brushRange = document.getElementById("brushRange");

const lightRangeValue = document.getElementById("lightRangeValue");
const brightnessRangeValue = document.getElementById("brightnessRangeValue");
const contrastRangeValue = document.getElementById("contrastRangeValue");
const temperatureRangeValue = document.getElementById("temperatureRangeValue");
const sharpnessRangeValue = document.getElementById("sharpnessRangeValue");
const brushRangeValue = document.getElementById("brushRangeValue");

let loadingSimulationTimer = null;
let currentProgress = 0;
let currentBatch = null;

const editorState = {
  item: null,
  mode: "view",
  isolatedImg: null,
  maskImg: null,
  originalMaskCanvas: document.createElement("canvas"),
  workingMaskCanvas: document.createElement("canvas"),
  tempMaskCanvas: document.createElement("canvas"),
  baseCanvas: document.createElement("canvas"),
  retouchCanvas: document.createElement("canvas"),
  displayCanvas: document.createElement("canvas"),
  history: [],
  historyIndex: -1,
  isDrawing: false,
  retouchSample: null,
  retouchHasSample: false,
  retouchStartTarget: null,
  retouchSourceStart: null,
  placement: null,
};

const originalMaskCtx = editorState.originalMaskCanvas.getContext("2d");
const workingMaskCtx = editorState.workingMaskCanvas.getContext("2d");
const baseCtx = editorState.baseCanvas.getContext("2d");
const retouchCtx = editorState.retouchCanvas.getContext("2d");
const displayCtx = editorState.displayCanvas.getContext("2d");

editorState.baseCanvas.width = 1000;
editorState.baseCanvas.height = 1000;
editorState.retouchCanvas.width = 1000;
editorState.retouchCanvas.height = 1000;
editorState.displayCanvas.width = 1000;
editorState.displayCanvas.height = 1000;

function setStatus(message) {
  statusBox.textContent = message;
}

function resetLoadingSteps() {
  loadingSteps.forEach((step) => {
    step.classList.remove("active", "done");
    const status = step.querySelector(".loading-step-status");
    if (status) status.textContent = "aguardando";
  });
}

function setLoadingStep(stepNumber, statusText = "em andamento") {
  loadingSteps.forEach((step) => {
    const num = Number(step.dataset.step);
    const status = step.querySelector(".loading-step-status");

    if (num < stepNumber) {
      step.classList.remove("active");
      step.classList.add("done");
      if (status) status.textContent = "concluído";
    } else if (num === stepNumber) {
      step.classList.remove("done");
      step.classList.add("active");
      if (status) status.textContent = statusText;
    } else {
      step.classList.remove("active", "done");
      if (status) status.textContent = "aguardando";
    }
  });
}

function setLoadingProgress(value, label = "") {
  currentProgress = Math.max(0, Math.min(100, value));
  loadingPercent.textContent = `${Math.round(currentProgress)}%`;
  loadingBarFill.style.width = `${currentProgress}%`;
  if (label) loadingCurrentStep.textContent = label;
}

function showLoading() {
  currentProgress = 0;
  resetLoadingSteps();
  setLoadingProgress(0, "Preparando lote...");
  loadingOverlay.classList.add("active");
}

function hideLoading() {
  if (loadingSimulationTimer) {
    clearInterval(loadingSimulationTimer);
    loadingSimulationTimer = null;
  }
  loadingOverlay.classList.remove("active");
}

function startLoadingSimulation(fileCount) {
  showLoading();

  const stages = [
    { progress: 8, step: 1, label: "Separando arquivos..." },
    { progress: 24, step: 2, label: "Enviando ao servidor..." },
    { progress: 58, step: 3, label: `Removendo fundo em ${fileCount} imagem(ns)...` },
    { progress: 82, step: 4, label: "Gerando JPG 1000x1000..." },
    { progress: 96, step: 5, label: "Finalizando ZIP..." },
  ];

  let stageIndex = 0;
  setLoadingStep(1, "em andamento");

  loadingSimulationTimer = setInterval(() => {
    if (stageIndex >= stages.length) return;

    const target = stages[stageIndex].progress;
    if (currentProgress < target) {
      setLoadingProgress(currentProgress + 1, stages[stageIndex].label);
      setLoadingStep(stages[stageIndex].step, "em andamento");
    } else {
      stageIndex += 1;
      if (stageIndex < stages.length) {
        setLoadingStep(stages[stageIndex].step, "em andamento");
      }
    }
  }, 80);
}

function finishLoadingSuccess() {
  if (loadingSimulationTimer) {
    clearInterval(loadingSimulationTimer);
    loadingSimulationTimer = null;
  }

  setLoadingProgress(100, "Processamento concluído.");
  loadingSteps.forEach((step) => {
    step.classList.remove("active");
    step.classList.add("done");
    const status = step.querySelector(".loading-step-status");
    if (status) status.textContent = "concluído";
  });

  setTimeout(() => {
    hideLoading();
  }, 700);
}

function finishLoadingError(message) {
  if (loadingSimulationTimer) {
    clearInterval(loadingSimulationTimer);
    loadingSimulationTimer = null;
  }
  loadingSubtitle.textContent = message || "Ocorreu uma falha durante o processamento.";
  setTimeout(() => {
    hideLoading();
  }, 900);
}

function xhrPostJson(url, formData, onUploadProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && typeof onUploadProgress === "function") {
        const percent = (event.loaded / event.total) * 100;
        onUploadProgress(percent);
      }
    };

    xhr.onload = () => {
      const text = xhr.responseText;
      let data = null;

      try {
        data = JSON.parse(text);
      } catch {
        reject(new Error("Resposta inválida do servidor."));
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        reject(new Error(data.error || "Falha ao processar o lote."));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Falha de comunicação com o servidor."));
    };

    xhr.send(formData);
  });
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Falha na operação.");
  }
  return data;
}

function resetResult() {
  resultBox.classList.remove("active");
  zipDownloadBtn.href = "#";
  galleryBox.classList.remove("active");
  galleryGrid.innerHTML = "";
}

function updateFileName() {
  const count = filesInput.files.length;
  if (!count) {
    fileName.textContent = "Nenhum ficheiro selecionado";
    return;
  }

  if (count === 1) {
    fileName.textContent = filesInput.files[0].name;
    return;
  }

  fileName.textContent = `${count} ficheiros selecionados`;
}

function cacheBust(url) {
  return `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
}

function renderGallery(items) {
  galleryGrid.innerHTML = "";

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "gallery-card";

    card.innerHTML = `
      <div class="gallery-name">${item.filename}</div>
      <div class="gallery-preview" data-image-id="${item.image_id}">
        <img src="${cacheBust(item.preview_url)}" alt="${item.filename}" loading="lazy">
      </div>
      <div class="result-actions">
        <button class="btn btn-primary open-editor-btn" type="button">Editar</button>
        <a class="btn btn-success" href="${item.download_url}" target="_blank" rel="noopener noreferrer">Baixar JPG</a>
      </div>
    `;

    card.querySelector(".gallery-preview").addEventListener("click", () => openEditor(item));
    card.querySelector(".open-editor-btn").addEventListener("click", () => openEditor(item));

    galleryGrid.appendChild(card);
  });

  galleryBox.classList.add("active");
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = cacheBust(src);
  });
}

function setToolMode(mode) {
  editorState.mode = mode;
  toolModeButtons.forEach((btn) => {
    btn.classList.toggle("btn-primary", btn.dataset.mode === mode);
    btn.classList.toggle("btn-secondary", btn.dataset.mode !== mode);
  });
}

function updateSliderLabels() {
  lightRangeValue.textContent = lightRange.value;
  brightnessRangeValue.textContent = brightnessRange.value;
  contrastRangeValue.textContent = contrastRange.value;
  temperatureRangeValue.textContent = temperatureRange.value;
  sharpnessRangeValue.textContent = sharpnessRange.value;
  brushRangeValue.textContent = brushRange.value;
}

function resetEditorControls() {
  lightRange.value = 0;
  brightnessRange.value = 0;
  contrastRange.value = 0;
  temperatureRange.value = 0;
  sharpnessRange.value = 0;
  brushRange.value = 30;
  updateSliderLabels();
  setToolMode("view");
}

function saveHistory() {
  const snapshot = {
    mask: workingMaskCtx.getImageData(
      0,
      0,
      editorState.workingMaskCanvas.width,
      editorState.workingMaskCanvas.height
    ),
    retouch: retouchCtx.getImageData(0, 0, 1000, 1000),
    controls: {
      light: Number(lightRange.value),
      brightness: Number(brightnessRange.value),
      contrast: Number(contrastRange.value),
      temperature: Number(temperatureRange.value),
      sharpness: Number(sharpnessRange.value),
    },
  };

  editorState.history = editorState.history.slice(0, editorState.historyIndex + 1);
  editorState.history.push(snapshot);
  if (editorState.history.length > 30) {
    editorState.history.shift();
  }
  editorState.historyIndex = editorState.history.length - 1;
}

function restoreHistory(index) {
  if (index < 0 || index >= editorState.history.length) return;

  const snapshot = editorState.history[index];
  editorState.historyIndex = index;

  editorState.workingMaskCanvas.width = snapshot.mask.width;
  editorState.workingMaskCanvas.height = snapshot.mask.height;
  workingMaskCtx.putImageData(snapshot.mask, 0, 0);

  retouchCtx.putImageData(snapshot.retouch, 0, 0);

  lightRange.value = snapshot.controls.light;
  brightnessRange.value = snapshot.controls.brightness;
  contrastRange.value = snapshot.controls.contrast;
  temperatureRange.value = snapshot.controls.temperature;
  sharpnessRange.value = snapshot.controls.sharpness;
  updateSliderLabels();

  redrawEditor(false);
}

function applyAdjustments(ctx, width, height) {
  const brightness = Number(brightnessRange.value);
  const contrast = Number(contrastRange.value);
  const temperature = Number(temperatureRange.value);
  const light = Number(lightRange.value);
  const sharpness = Number(sharpnessRange.value);

  let imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    r += brightness + light;
    g += brightness + light;
    b += brightness + light;

    r = contrastFactor * (r - 128) + 128;
    g = contrastFactor * (g - 128) + 128;
    b = contrastFactor * (b - 128) + 128;

    r += temperature * 0.6;
    b -= temperature * 0.6;

    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
  }

  ctx.putImageData(imageData, 0, 0);

  if (sharpness > 0) {
    const strength = sharpness / 100;
    const src = ctx.getImageData(0, 0, width, height);
    const dst = ctx.createImageData(width, height);

    const s = src.data;
    const d = dst.data;
    const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;

        for (let c = 0; c < 3; c++) {
          let acc = 0;
          let k = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const srcIdx = ((y + ky) * width + (x + kx)) * 4 + c;
              acc += s[srcIdx] * kernel[k++];
            }
          }

          d[idx + c] = Math.max(
            0,
            Math.min(255, s[idx + c] * (1 - strength) + acc * strength)
          );
        }

        d[idx + 3] = s[idx + 3];
      }
    }

    ctx.putImageData(dst, 0, 0);
  }
}

function renderBaseFromMask() {
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = editorState.isolatedImg.width;
  tempCanvas.height = editorState.isolatedImg.height;
  const tempCtx = tempCanvas.getContext("2d");

  tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
  tempCtx.drawImage(editorState.isolatedImg, 0, 0);

  const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  const maskData = workingMaskCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height).data;

  for (let i = 0; i < imageData.data.length; i += 4) {
    imageData.data[i + 3] = maskData[i];
  }
  tempCtx.putImageData(imageData, 0, 0);

  const bbox = getAlphaBoundingBox(tempCanvas);

  baseCtx.clearRect(0, 0, 1000, 1000);
  baseCtx.fillStyle = "#ffffff";
  baseCtx.fillRect(0, 0, 1000, 1000);

  if (!bbox) {
    editorState.placement = null;
    return;
  }

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = bbox.w;
  cropCanvas.height = bbox.h;
  const cropCtx = cropCanvas.getContext("2d");
  cropCtx.drawImage(tempCanvas, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, bbox.w, bbox.h);

  const marginPx = Math.round(1000 * 0.08);
  const maxW = 1000 - marginPx * 2;
  const maxH = 1000 - marginPx * 2;
  const fitScale = Math.min(maxW / bbox.w, maxH / bbox.h);
  const drawW = Math.max(1, Math.round(bbox.w * fitScale));
  const drawH = Math.max(1, Math.round(bbox.h * fitScale));
  const drawX = Math.round((1000 - drawW) / 2);
  const drawY = Math.round((1000 - drawH) / 2);

  baseCtx.drawImage(cropCanvas, drawX, drawY, drawW, drawH);
  applyAdjustments(baseCtx, 1000, 1000);

  editorState.placement = {
    bbox,
    drawX,
    drawY,
    drawW,
    drawH,
    scaleX: bbox.w / drawW,
    scaleY: bbox.h / drawH,
  };
}

function copyBaseToRetouch() {
  retouchCtx.clearRect(0, 0, 1000, 1000);
  retouchCtx.drawImage(editorState.baseCanvas, 0, 0);
}

function redrawEditor(resetRetouch = true) {
  renderBaseFromMask();
  if (resetRetouch) {
    copyBaseToRetouch();
  }

  displayCtx.clearRect(0, 0, 1000, 1000);
  displayCtx.drawImage(editorState.retouchCanvas, 0, 0);

  editorCtx.clearRect(0, 0, 1000, 1000);
  editorCtx.drawImage(editorState.displayCanvas, 0, 0);
}

function getAlphaBoundingBox(canvas) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function canvasPoint(event) {
  const rect = editorCanvas.getBoundingClientRect();
  const scaleX = editorCanvas.width / rect.width;
  const scaleY = editorCanvas.height / rect.height;

  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function toMaskCoords(x, y) {
  const p = editorState.placement;
  if (!p) return null;

  if (x < p.drawX || y < p.drawY || x > p.drawX + p.drawW || y > p.drawY + p.drawH) {
    return null;
  }

  const cropX = (x - p.drawX) * p.scaleX;
  const cropY = (y - p.drawY) * p.scaleY;

  return {
    x: Math.round(p.bbox.x + cropX),
    y: Math.round(p.bbox.y + cropY),
  };
}

function drawMaskLine(from, to, restore = false) {
  workingMaskCtx.save();
  workingMaskCtx.strokeStyle = restore ? "#ffffff" : "#000000";
  workingMaskCtx.fillStyle = restore ? "#ffffff" : "#000000";
  workingMaskCtx.lineWidth = Number(brushRange.value);
  workingMaskCtx.lineCap = "round";
  workingMaskCtx.lineJoin = "round";

  workingMaskCtx.beginPath();
  workingMaskCtx.moveTo(from.x, from.y);
  workingMaskCtx.lineTo(to.x, to.y);
  workingMaskCtx.stroke();

  workingMaskCtx.beginPath();
  workingMaskCtx.arc(to.x, to.y, Number(brushRange.value) / 2, 0, Math.PI * 2);
  workingMaskCtx.fill();

  workingMaskCtx.restore();
}

function cloneStamp(fromX, fromY, toX, toY) {
  const size = Number(brushRange.value);
  const radius = size / 2;

  retouchCtx.save();
  retouchCtx.beginPath();
  retouchCtx.arc(toX, toY, radius, 0, Math.PI * 2);
  retouchCtx.clip();

  retouchCtx.drawImage(
    editorState.retouchCanvas,
    fromX - radius,
    fromY - radius,
    size,
    size,
    toX - radius,
    toY - radius,
    size,
    size
  );

  retouchCtx.restore();
}

function openEditor(item) {
  editorState.item = item;
  editorTitle.textContent = `Editor — ${item.filename}`;
  editorDownloadBtn.href = item.download_url;
  resetEditorControls();

  Promise.all([loadImage(item.isolated_url), loadImage(item.mask_url)])
    .then(([isolatedImg, maskImg]) => {
      editorState.isolatedImg = isolatedImg;
      editorState.maskImg = maskImg;

      editorState.originalMaskCanvas.width = maskImg.width;
      editorState.originalMaskCanvas.height = maskImg.height;
      originalMaskCtx.clearRect(0, 0, maskImg.width, maskImg.height);
      originalMaskCtx.drawImage(maskImg, 0, 0);

      editorState.workingMaskCanvas.width = maskImg.width;
      editorState.workingMaskCanvas.height = maskImg.height;
      workingMaskCtx.clearRect(0, 0, maskImg.width, maskImg.height);
      workingMaskCtx.drawImage(maskImg, 0, 0);

      redrawEditor(true);

      editorState.history = [];
      editorState.historyIndex = -1;
      editorState.retouchHasSample = false;
      saveHistory();

      editorModal.classList.add("active");
    })
    .catch(() => {
      setStatus("Não foi possível abrir o editor da imagem.");
    });
}

function closeEditor() {
  editorModal.classList.remove("active");
  editorState.item = null;
  editorState.isDrawing = false;
  editorState.retouchHasSample = false;
}

function resetEditor() {
  if (!editorState.item) return;

  workingMaskCtx.clearRect(0, 0, editorState.originalMaskCanvas.width, editorState.originalMaskCanvas.height);
  workingMaskCtx.drawImage(editorState.originalMaskCanvas, 0, 0);
  resetEditorControls();
  redrawEditor(true);
  editorState.history = [];
  editorState.historyIndex = -1;
  editorState.retouchHasSample = false;
  saveHistory();
}

async function saveEditor() {
  if (!editorState.item) return;

  try {
    saveBtn.disabled = true;
    setStatus("Salvando imagem editada...");

    const dataUrl = editorState.retouchCanvas.toDataURL("image/jpeg", 0.95);
    const data = await postJson(editorState.item.save_url, { data_url: dataUrl });

    editorState.item.preview_url = data.preview_url;
    editorState.item.download_url = data.download_url;

    const cards = Array.from(galleryGrid.querySelectorAll(".gallery-card"));
    cards.forEach((card) => {
      const name = card.querySelector(".gallery-name")?.textContent;
      if (name === editorState.item.filename) {
        const img = card.querySelector("img");
        const link = card.querySelector("a");
        if (img) img.src = cacheBust(data.preview_url);
        if (link) link.href = data.download_url;
      }
    });

    editorDownloadBtn.href = data.download_url;
    setStatus("Imagem editada salva com sucesso.");
  } catch (error) {
    setStatus(error.message || "Falha ao salvar a imagem editada.");
  } finally {
    saveBtn.disabled = false;
  }
}

function handleEditorPointerDown(event) {
  if (!editorState.item) return;

  const point = canvasPoint(event);

  if (editorState.mode === "erase" || editorState.mode === "restore") {
    const maskPoint = toMaskCoords(point.x, point.y);
    if (!maskPoint) return;
    editorState.isDrawing = true;
    editorState.lastMaskPoint = maskPoint;
    drawMaskLine(maskPoint, maskPoint, editorState.mode === "restore");
    redrawEditor(true);
    return;
  }

  if (editorState.mode === "retouch") {
    if (!editorState.retouchHasSample) {
      editorState.retouchSample = { x: point.x, y: point.y };
      editorState.retouchHasSample = true;
      setStatus("Amostra capturada. Agora arraste sobre a área que deseja corrigir.");
      return;
    }

    editorState.isDrawing = true;
    editorState.retouchStartTarget = { x: point.x, y: point.y };
    editorState.retouchSourceStart = { ...editorState.retouchSample };
    cloneStamp(point.x, point.y, point.x, point.y);
    editorCtx.drawImage(editorState.retouchCanvas, 0, 0);
  }
}

function handleEditorPointerMove(event) {
  if (!editorState.item || !editorState.isDrawing) return;

  const point = canvasPoint(event);

  if (editorState.mode === "erase" || editorState.mode === "restore") {
    const maskPoint = toMaskCoords(point.x, point.y);
    if (!maskPoint) return;
    drawMaskLine(editorState.lastMaskPoint, maskPoint, editorState.mode === "restore");
    editorState.lastMaskPoint = maskPoint;
    redrawEditor(true);
    return;
  }

  if (editorState.mode === "retouch" && editorState.retouchStartTarget && editorState.retouchSourceStart) {
    const dx = point.x - editorState.retouchStartTarget.x;
    const dy = point.y - editorState.retouchStartTarget.y;
    const sourceX = editorState.retouchSourceStart.x + dx;
    const sourceY = editorState.retouchSourceStart.y + dy;
    cloneStamp(sourceX, sourceY, point.x, point.y);
    editorCtx.drawImage(editorState.retouchCanvas, 0, 0);
  }
}

function handleEditorPointerUp() {
  if (!editorState.item || !editorState.isDrawing) return;
  editorState.isDrawing = false;
  saveHistory();
}

function bindDragAndDrop() {
  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropZone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropZone.classList.remove("dragover");
    });
  });

  dropZone.addEventListener("drop", (event) => {
    const files = event.dataTransfer?.files;
    if (!files || !files.length) return;
    filesInput.files = files;
    updateFileName();
  });
}

filesInput.addEventListener("change", updateFileName);

clearBtn.addEventListener("click", () => {
  filesInput.value = "";
  fileName.textContent = "Nenhum ficheiro selecionado";
  setStatus("Aguardando envio das imagens.");
  resetResult();
});

bindDragAndDrop();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!filesInput.files.length) {
    setStatus("Selecione ao menos uma imagem.");
    return;
  }

  if (filesInput.files.length > 50) {
    setStatus("Envie no máximo 50 imagens por vez.");
    return;
  }

  const formData = new FormData();
  Array.from(filesInput.files).forEach((file) => formData.append("files", file));
  formData.append("margin_percent", "8");
  formData.append("jpeg_quality", "95");

  submitBtn.disabled = true;
  resetResult();
  setStatus("Processando lote... aguarde.");
  startLoadingSimulation(filesInput.files.length);

  try {
    const data = await xhrPostJson("/api/process-batch", formData, (uploadPercent) => {
      const mapped = 8 + Math.round(uploadPercent * 0.16);
      setLoadingProgress(Math.min(mapped, 24), "Enviando ao servidor...");
      setLoadingStep(2, "enviando");
    });

    currentBatch = data;
    finishLoadingSuccess();
    setStatus(
      `Concluído.\nImagens processadas: ${data.count}\nFormato final: JPG\nFundo: branco\nTamanho: 1000x1000 px`
    );

    resultText.textContent = `Lote concluído com ${data.count} imagem(ns).`;
    zipDownloadBtn.href = data.zip_url;
    resultBox.classList.add("active");
    renderGallery(data.items || []);
  } catch (error) {
    finishLoadingError(error.message);
    setStatus(error.message || "Falha ao processar o lote.");
  } finally {
    submitBtn.disabled = false;
  }
});

toolModeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    setToolMode(btn.dataset.mode);
    if (btn.dataset.mode === "retouch") {
      editorState.retouchHasSample = false;
      setStatus("No modo Retocar, o primeiro clique define a amostra.");
    }
  });
});

[lightRange, brightnessRange, contrastRange, temperatureRange, sharpnessRange, brushRange].forEach((input) => {
  input.addEventListener("input", () => {
    updateSliderLabels();
    if (editorState.item) {
      redrawEditor(true);
      saveHistory();
    }
  });
});

editorCanvas.addEventListener("mousedown", handleEditorPointerDown);
editorCanvas.addEventListener("mousemove", handleEditorPointerMove);
window.addEventListener("mouseup", handleEditorPointerUp);

closeEditorBtn.addEventListener("click", closeEditor);
resetBtn.addEventListener("click", resetEditor);
saveBtn.addEventListener("click", saveEditor);

undoBtn.addEventListener("click", () => {
  if (editorState.historyIndex > 0) {
    restoreHistory(editorState.historyIndex - 1);
  }
});

redoBtn.addEventListener("click", () => {
  if (editorState.historyIndex < editorState.history.length - 1) {
    restoreHistory(editorState.historyIndex + 1);
  }
});

editorModal.addEventListener("click", (event) => {
  if (event.target === editorModal) {
    closeEditor();
  }
});

updateSliderLabels();
setToolMode("view");
