const form = document.getElementById("uploadForm");
const filesInput = document.getElementById("files");
const fileName = document.getElementById("fileName");
const statusBox = document.getElementById("status");
const submitBtn = document.getElementById("submitBtn");
const clearBtn = document.getElementById("clearBtn");

const dropZone = document.getElementById("dropZone");

const outputFormat = document.getElementById("outputFormat");
const backgroundMode = document.getElementById("backgroundMode");
const outputWidth = document.getElementById("outputWidth");
const outputHeight = document.getElementById("outputHeight");

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

const introOverlay = document.getElementById("introOverlay");
const introLoadingFill = document.getElementById("introLoadingFill");
const introLoadingLabel = document.getElementById("introLoadingLabel");
const introLoadingPercent = document.getElementById("introLoadingPercent");
const introSteps = Array.from(document.querySelectorAll(".intro-step"));

const editorModal = document.getElementById("editorModal");
const editorTitle = document.getElementById("editorTitle");
const closeEditorBtn = document.getElementById("closeEditorBtn");
const saveBtn = document.getElementById("saveBtn");
const resetBtn = document.getElementById("resetBtn");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const editorDownloadBtn = document.getElementById("editorDownloadBtn");
const renameInEditorBtn = document.getElementById("renameInEditorBtn");
const editorFileName = document.getElementById("editorFileName");

const editorCanvas = document.getElementById("editorCanvas");
const editorCtx = editorCanvas.getContext("2d");
const canvasViewport = document.getElementById("canvasViewport");
const canvasStage = document.getElementById("canvasStage");
const brushCursor = document.getElementById("brushCursor");

const toolModeButtons = Array.from(document.querySelectorAll(".tool-mode"));

const editorOutputFormat = document.getElementById("editorOutputFormat");
const editorBackgroundMode = document.getElementById("editorBackgroundMode");
const editorOutputWidth = document.getElementById("editorOutputWidth");
const editorOutputHeight = document.getElementById("editorOutputHeight");

const viewZoomRange = document.getElementById("viewZoomRange");
const zoomRange = document.getElementById("zoomRange");
const posXRange = document.getElementById("posXRange");
const posYRange = document.getElementById("posYRange");
const lightRange = document.getElementById("lightRange");
const brightnessRange = document.getElementById("brightnessRange");
const contrastRange = document.getElementById("contrastRange");
const temperatureRange = document.getElementById("temperatureRange");
const sharpnessRange = document.getElementById("sharpnessRange");
const brushRange = document.getElementById("brushRange");

const viewZoomRangeValue = document.getElementById("viewZoomRangeValue");
const zoomRangeValue = document.getElementById("zoomRangeValue");
const posXRangeValue = document.getElementById("posXRangeValue");
const posYRangeValue = document.getElementById("posYRangeValue");
const lightRangeValue = document.getElementById("lightRangeValue");
const brightnessRangeValue = document.getElementById("brightnessRangeValue");
const contrastRangeValue = document.getElementById("contrastRangeValue");
const temperatureRangeValue = document.getElementById("temperatureRangeValue");
const sharpnessRangeValue = document.getElementById("sharpnessRangeValue");
const brushRangeValue = document.getElementById("brushRangeValue");

let loadingSimulationTimer = null;
let currentProgress = 0;

const editorState = {
  item: null,
  mode: "view",
  isolatedImg: null,
  maskImg: null,
  originalMaskCanvas: document.createElement("canvas"),
  workingMaskCanvas: document.createElement("canvas"),
  baseCanvas: document.createElement("canvas"),
  retouchCanvas: document.createElement("canvas"),
  finalCanvas: document.createElement("canvas"),
  history: [],
  historyIndex: -1,
  isDrawing: false,
  lastMaskPoint: null,
  placement: null,
};

const originalMaskCtx = editorState.originalMaskCanvas.getContext("2d");
const workingMaskCtx = editorState.workingMaskCanvas.getContext("2d");
const baseCtx = editorState.baseCanvas.getContext("2d");
const retouchCtx = editorState.retouchCanvas.getContext("2d");
const finalCtx = editorState.finalCanvas.getContext("2d");

editorState.baseCanvas.width = 1000;
editorState.baseCanvas.height = 1000;
editorState.retouchCanvas.width = 1000;
editorState.retouchCanvas.height = 1000;
editorState.finalCanvas.width = 1000;
editorState.finalCanvas.height = 1000;

function setStatus(message) {
  statusBox.textContent = message;
}

function normalizeDimension(value, fallback = 1000) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(100, Math.min(5000, Math.round(n)));
}

function sanitizeFileBaseName(name) {
  const clean = (name || "")
    .replace(/\.[a-zA-Z0-9]+$/, "")
    .replace(/[^a-zA-Z0-9\-_ ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/^[-_ ]+|[-_ ]+$/g, "");
  return clean || "imagem";
}

function fileBaseFromDisplayName(name) {
  return String(name || "").replace(/\.[a-zA-Z0-9]+$/, "");
}

function syncFormatAndBackground(formatEl, backgroundEl) {
  if (formatEl.value === "jpg" || formatEl.value === "jpeg") {
    backgroundEl.value = "white";
    backgroundEl.disabled = true;
  } else {
    backgroundEl.disabled = false;
  }
}

function setTransparencyPreview(isTransparent) {
  canvasStage.classList.toggle("transparent-bg", isTransparent);
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
    { progress: 82, step: 4, label: "Gerando arquivo final..." },
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

  setTimeout(() => hideLoading(), 700);
}

function finishLoadingError(message) {
  if (loadingSimulationTimer) {
    clearInterval(loadingSimulationTimer);
    loadingSimulationTimer = null;
  }
  loadingSubtitle.textContent = message || "Ocorreu uma falha durante o processamento.";
  setTimeout(() => hideLoading(), 900);
}

function setIntroStep(stepNumber, label) {
  introSteps.forEach((step) => {
    const num = Number(step.dataset.step);
    const status = step.querySelector(".intro-step-status");

    if (num < stepNumber) {
      step.classList.remove("active");
      step.classList.add("done");
      if (status) status.textContent = "concluído";
    } else if (num === stepNumber) {
      step.classList.remove("done");
      step.classList.add("active");
      if (status) status.textContent = "carregando";
    } else {
      step.classList.remove("active", "done");
      if (status) status.textContent = "aguardando";
    }
  });

  if (label) introLoadingLabel.textContent = label;
}

function runIntroLoading() {
  return new Promise((resolve) => {
    const stages = [
      { progress: 18, step: 1, label: "Inicializando interface..." },
      { progress: 44, step: 2, label: "Preparando editor..." },
      { progress: 73, step: 3, label: "Aplicando configurações..." },
      { progress: 100, step: 4, label: "Finalizando ambiente..." },
    ];

    let current = 0;
    let stageIndex = 0;
    setIntroStep(1, stages[0].label);

    const timer = setInterval(() => {
      if (stageIndex >= stages.length) {
        clearInterval(timer);
        introOverlay.classList.add("hidden");
        setTimeout(resolve, 450);
        return;
      }

      const target = stages[stageIndex].progress;
      if (current < target) {
        current += 1;
        introLoadingFill.style.width = `${current}%`;
        introLoadingPercent.textContent = `${current}%`;
      } else {
        stageIndex += 1;
        if (stageIndex < stages.length) {
          setIntroStep(stages[stageIndex].step, stages[stageIndex].label);
        }
      }
    }, 24);
  });
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
      let data;
      try {
        data = JSON.parse(xhr.responseText);
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

    xhr.onerror = () => reject(new Error("Falha de comunicação com o servidor."));
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
  if (!response.ok) throw new Error(data.error || "Falha na operação.");
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
  fileName.textContent = count === 1 ? filesInput.files[0].name : `${count} ficheiros selecionados`;
}

function cacheBust(url) {
  return `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
}

async function renameItem(item, newName) {
  const cleanName = sanitizeFileBaseName(newName);
  const data = await postJson(item.rename_url, { new_name: cleanName });
  item.display_name = data.display_name;
  item.output_filename = data.output_filename;
  item.preview_url = data.preview_url;
  item.download_url = data.download_url;
  return item;
}

function renderGallery(items) {
  galleryGrid.innerHTML = "";

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "gallery-card";

    const transparentClass = item.background_mode === "transparent" ? "transparent-bg" : "";
    const outputLabel = `${String(item.output_format).toUpperCase()} • ${item.output_width}x${item.output_height} • ${item.background_mode === "transparent" ? "Transparente" : "Branco"}`;

    card.innerHTML = `
      <div class="gallery-name">${item.display_name || item.output_filename}</div>
      <div class="gallery-meta">${outputLabel}</div>

      <div class="gallery-preview ${transparentClass}">
        <img src="${cacheBust(item.preview_url)}" alt="${item.filename}" loading="lazy">
      </div>

      <div class="gallery-rename">
        <input type="text" class="rename-input" value="${fileBaseFromDisplayName(item.display_name || item.output_filename)}">
        <button class="btn btn-secondary rename-btn" type="button">Renomear</button>
      </div>

      <div class="result-actions">
        <button class="btn btn-primary open-editor-btn" type="button">Editar</button>
        <a class="btn btn-success" href="${item.download_url}" target="_blank" rel="noopener noreferrer">Baixar arquivo</a>
      </div>
    `;

    card.querySelector(".gallery-preview").addEventListener("click", () => openEditor(item));
    card.querySelector(".open-editor-btn").addEventListener("click", () => openEditor(item));

    const renameInput = card.querySelector(".rename-input");
    const renameBtn = card.querySelector(".rename-btn");

    renameBtn.addEventListener("click", async () => {
      try {
        renameBtn.disabled = true;
        setStatus("Renomeando arquivo...");
        await renameItem(item, renameInput.value);
        renderGallery(window.__photopeg_items);
        setStatus("Arquivo renomeado com sucesso.");
      } catch (error) {
        console.error("Erro ao renomear:", error);
        setStatus(error.message || "Falha ao renomear o arquivo.");
      } finally {
        renameBtn.disabled = false;
      }
    });

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
  updateBrushCursorVisibility();
}

function applyViewZoom() {
  const scale = Number(viewZoomRange.value) / 100;
  canvasViewport.style.transform = `scale(${scale})`;
}

function getEditorOutputSettings() {
  const format = editorOutputFormat.value;
  const background = (format === "jpg" || format === "jpeg") ? "white" : editorBackgroundMode.value;
  const width = normalizeDimension(editorOutputWidth.value, 1000);
  const height = normalizeDimension(editorOutputHeight.value, 1000);
  return { format, background, width, height };
}

function updateSliderLabels() {
  viewZoomRangeValue.textContent = `${viewZoomRange.value}%`;
  zoomRangeValue.textContent = `${zoomRange.value}%`;
  posXRangeValue.textContent = posXRange.value;
  posYRangeValue.textContent = posYRange.value;
  lightRangeValue.textContent = lightRange.value;
  brightnessRangeValue.textContent = brightnessRange.value;
  contrastRangeValue.textContent = contrastRange.value;
  temperatureRangeValue.textContent = temperatureRange.value;
  sharpnessRangeValue.textContent = sharpnessRange.value;
  brushRangeValue.textContent = brushRange.value;
  updateBrushCursorSize();
}

function resetEditorControls() {
  viewZoomRange.value = 58;
  zoomRange.value = 100;
  posXRange.value = 0;
  posYRange.value = 0;
  lightRange.value = 0;
  brightnessRange.value = 0;
  contrastRange.value = 0;
  temperatureRange.value = 0;
  sharpnessRange.value = 0;
  brushRange.value = 40;
  updateSliderLabels();
  applyViewZoom();
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
    retouch: retouchCtx.getImageData(
      0,
      0,
      editorState.retouchCanvas.width,
      editorState.retouchCanvas.height
    ),
    controls: {
      zoom: Number(zoomRange.value),
      posX: Number(posXRange.value),
      posY: Number(posYRange.value),
      light: Number(lightRange.value),
      brightness: Number(brightnessRange.value),
      contrast: Number(contrastRange.value),
      temperature: Number(temperatureRange.value),
      sharpness: Number(sharpnessRange.value),
      brush: Number(brushRange.value),
    },
  };

  editorState.history = editorState.history.slice(0, editorState.historyIndex + 1);
  editorState.history.push(snapshot);
  if (editorState.history.length > 30) editorState.history.shift();
  editorState.historyIndex = editorState.history.length - 1;
}

function restoreHistory(index) {
  if (index < 0 || index >= editorState.history.length) return;

  const snapshot = editorState.history[index];
  editorState.historyIndex = index;

  editorState.workingMaskCanvas.width = snapshot.mask.width;
  editorState.workingMaskCanvas.height = snapshot.mask.height;
  workingMaskCtx.putImageData(snapshot.mask, 0, 0);

  editorState.retouchCanvas.width = snapshot.retouch.width;
  editorState.retouchCanvas.height = snapshot.retouch.height;
  retouchCtx.putImageData(snapshot.retouch, 0, 0);

  zoomRange.value = snapshot.controls.zoom;
  posXRange.value = snapshot.controls.posX;
  posYRange.value = snapshot.controls.posY;
  lightRange.value = snapshot.controls.light;
  brightnessRange.value = snapshot.controls.brightness;
  contrastRange.value = snapshot.controls.contrast;
  temperatureRange.value = snapshot.controls.temperature;
  sharpnessRange.value = snapshot.controls.sharpness;
  brushRange.value = snapshot.controls.brush;

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
          d[idx + c] = Math.max(0, Math.min(255, s[idx + c] * (1 - strength) + acc * strength));
        }
        d[idx + 3] = s[idx + 3];
      }
    }

    ctx.putImageData(dst, 0, 0);
  }
}

function renderBaseFromMask() {
  const { width: outputW, height: outputH, background } = getEditorOutputSettings();

  editorState.baseCanvas.width = outputW;
  editorState.baseCanvas.height = outputH;
  baseCtx.clearRect(0, 0, outputW, outputH);

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

  if (background === "transparent") {
    baseCtx.clearRect(0, 0, outputW, outputH);
  } else {
    baseCtx.fillStyle = "#ffffff";
    baseCtx.fillRect(0, 0, outputW, outputH);
  }

  if (!bbox) {
    editorState.placement = null;
    return;
  }

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = bbox.w;
  cropCanvas.height = bbox.h;
  const cropCtx = cropCanvas.getContext("2d");
  cropCtx.drawImage(tempCanvas, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, bbox.w, bbox.h);

  const marginX = Math.round(outputW * 0.08);
  const marginY = Math.round(outputH * 0.08);
  const maxW = outputW - marginX * 2;
  const maxH = outputH - marginY * 2;
  const fitScale = Math.min(maxW / bbox.w, maxH / bbox.h);

  const zoomFactor = Number(zoomRange.value) / 100;
  const drawW = Math.max(1, Math.round(bbox.w * fitScale * zoomFactor));
  const drawH = Math.max(1, Math.round(bbox.h * fitScale * zoomFactor));

  const moveX = Number(posXRange.value);
  const moveY = Number(posYRange.value);

  const drawX = Math.round((outputW - drawW) / 2 + moveX);
  const drawY = Math.round((outputH - drawH) / 2 + moveY);

  baseCtx.drawImage(cropCanvas, drawX, drawY, drawW, drawH);
  applyAdjustments(baseCtx, outputW, outputH);

  editorState.placement = {
    bbox,
    drawX,
    drawY,
    drawW,
    drawH,
    scaleX: bbox.w / drawW,
    scaleY: bbox.h / drawH,
    outputW,
    outputH,
  };
}

function copyBaseToRetouch() {
  const { width: outputW, height: outputH } = getEditorOutputSettings();
  editorState.retouchCanvas.width = outputW;
  editorState.retouchCanvas.height = outputH;
  retouchCtx.clearRect(0, 0, outputW, outputH);
  retouchCtx.drawImage(editorState.baseCanvas, 0, 0);
}

function updateCanvasElementSize() {
  const { width: outputW, height: outputH } = getEditorOutputSettings();
  editorCanvas.width = outputW;
  editorCanvas.height = outputH;
  editorCanvas.style.width = `${outputW}px`;
  editorCanvas.style.height = `${outputH}px`;
}

function redrawEditor(resetRetouch = true) {
  updateCanvasElementSize();
  renderBaseFromMask();

  if (resetRetouch) {
    copyBaseToRetouch();
  }

  editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
  editorCtx.drawImage(editorState.retouchCanvas, 0, 0);
  setTransparencyPreview(getEditorOutputSettings().background === "transparent");
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

function getAverageColorFromRing(ctx, cx, cy, innerR, outerR) {
  const x0 = Math.max(0, Math.floor(cx - outerR));
  const y0 = Math.max(0, Math.floor(cy - outerR));
  const x1 = Math.min(ctx.canvas.width - 1, Math.ceil(cx + outerR));
  const y1 = Math.min(ctx.canvas.height - 1, Math.ceil(cy + outerR));

  const imageData = ctx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  const data = imageData.data;

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;

  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      const px = x0 + x;
      const py = y0 + y;
      const dx = px - cx;
      const dy = py - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist >= innerR && dist <= outerR) {
        const idx = (y * imageData.width + x) * 4;
        const alpha = data[idx + 3];
        if (alpha > 10) {
          rSum += data[idx];
          gSum += data[idx + 1];
          bSum += data[idx + 2];
          count++;
        }
      }
    }
  }

  if (!count) return { r: 255, g: 255, b: 255 };

  return {
    r: Math.round(rSum / count),
    g: Math.round(gSum / count),
    b: Math.round(bSum / count),
  };
}

function healSpot(ctx, cx, cy, radius) {
  const innerRing = radius * 1.15;
  const outerRing = radius * 1.95;
  const avg = getAverageColorFromRing(ctx, cx, cy, innerRing, outerRing);

  const x0 = Math.max(0, Math.floor(cx - radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const x1 = Math.min(ctx.canvas.width - 1, Math.ceil(cx + radius));
  const y1 = Math.min(ctx.canvas.height - 1, Math.ceil(cy + radius));

  const imageData = ctx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  const data = imageData.data;

  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      const px = x0 + x;
      const py = y0 + y;
      const dx = px - cx;
      const dy = py - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        const idx = (y * imageData.width + x) * 4;
        const alpha = data[idx + 3];
        if (alpha <= 10) continue;

        const feather = 1 - (dist / radius);
        const strength = Math.max(0.18, feather * 0.72);

        data[idx] = Math.round(data[idx] * (1 - strength) + avg.r * strength);
        data[idx + 1] = Math.round(data[idx + 1] * (1 - strength) + avg.g * strength);
        data[idx + 2] = Math.round(data[idx + 2] * (1 - strength) + avg.b * strength);
      }
    }
  }

  ctx.putImageData(imageData, x0, y0);
}

function updateBrushCursorSize() {
  if (!brushCursor) return;
  const size = Number(brushRange.value) * 2;
  brushCursor.style.width = `${size}px`;
  brushCursor.style.height = `${size}px`;
}

function updateBrushCursorVisibility() {
  if (!brushCursor) return;
  const show = !!editorState.item && (
    editorState.mode === "retouch" ||
    editorState.mode === "erase" ||
    editorState.mode === "restore"
  );
  brushCursor.style.display = show ? "block" : "none";
}

function moveBrushCursor(event) {
  if (!editorState.item || !brushCursor || !canvasViewport) return;
  const rect = canvasViewport.getBoundingClientRect();
  brushCursor.style.left = `${event.clientX - rect.left}px`;
  brushCursor.style.top = `${event.clientY - rect.top}px`;
  updateBrushCursorVisibility();
}

function hideBrushCursor() {
  if (brushCursor) brushCursor.style.display = "none";
}

function openEditor(item) {
  editorState.item = item;
  editorTitle.textContent = `Editor — ${item.display_name || item.output_filename}`;
  editorDownloadBtn.href = item.download_url;
  editorFileName.value = fileBaseFromDisplayName(item.display_name || item.output_filename);

  editorOutputFormat.value = item.output_format || "jpg";
  editorBackgroundMode.value = item.background_mode || "white";
  editorOutputWidth.value = item.output_width || 1000;
  editorOutputHeight.value = item.output_height || 1000;

  syncFormatAndBackground(editorOutputFormat, editorBackgroundMode);
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
      saveHistory();

      editorModal.classList.add("active");
      updateBrushCursorSize();
      updateBrushCursorVisibility();
    })
    .catch((error) => {
      console.error("Erro ao abrir editor:", error);
      setStatus("Não foi possível abrir o editor da imagem.");
    });
}

function closeEditor() {
  editorModal.classList.remove("active");
  editorState.item = null;
  editorState.isDrawing = false;
  editorState.lastMaskPoint = null;
  hideBrushCursor();
}

function resetEditor() {
  if (!editorState.item) return;

  workingMaskCtx.clearRect(
    0,
    0,
    editorState.originalMaskCanvas.width,
    editorState.originalMaskCanvas.height
  );
  workingMaskCtx.drawImage(editorState.originalMaskCanvas, 0, 0);

  resetEditorControls();
  redrawEditor(true);
  editorState.history = [];
  editorState.historyIndex = -1;
  saveHistory();
}

async function saveEditor() {
  if (!editorState.item) return;

  try {
    saveBtn.disabled = true;
    setStatus("Salvando imagem editada...");

    const settings = getEditorOutputSettings();
    const mime = settings.format === "png" ? "image/png" : "image/jpeg";
    const quality = settings.format === "png" ? undefined : 0.95;

    editorState.finalCanvas.width = settings.width;
    editorState.finalCanvas.height = settings.height;
    finalCtx.clearRect(0, 0, settings.width, settings.height);
    finalCtx.drawImage(editorState.retouchCanvas, 0, 0);

    const dataUrl = editorState.finalCanvas.toDataURL(mime, quality);
    const data = await postJson(editorState.item.save_url, { data_url: dataUrl });

    editorState.item.preview_url = data.preview_url;
    editorState.item.download_url = data.download_url;
    editorState.item.output_format = settings.format;
    editorState.item.background_mode = settings.background;
    editorState.item.output_width = settings.width;
    editorState.item.output_height = settings.height;

    const itemIndex = window.__photopeg_items.findIndex(
      (x) => x.image_id === editorState.item.image_id
    );
    if (itemIndex >= 0) window.__photopeg_items[itemIndex] = { ...editorState.item };

    renderGallery(window.__photopeg_items);
    editorDownloadBtn.href = data.download_url;
    setStatus("Imagem editada salva com sucesso.");
  } catch (error) {
    console.error("Erro ao salvar:", error);
    setStatus(error.message || "Falha ao salvar a imagem editada.");
  } finally {
    saveBtn.disabled = false;
  }
}

async function renameCurrentEditorItem() {
  if (!editorState.item) return;
  try {
    renameInEditorBtn.disabled = true;
    setStatus("Renomeando arquivo...");
    await renameItem(editorState.item, editorFileName.value);
    editorTitle.textContent = `Editor — ${editorState.item.display_name || editorState.item.output_filename}`;
    editorDownloadBtn.href = editorState.item.download_url;
    renderGallery(window.__photopeg_items);
    setStatus("Arquivo renomeado com sucesso.");
  } catch (error) {
    console.error("Erro ao renomear:", error);
    setStatus(error.message || "Falha ao renomear o arquivo.");
  } finally {
    renameInEditorBtn.disabled = false;
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
    editorState.isDrawing = true;
    healSpot(retouchCtx, point.x, point.y, Number(brushRange.value));
    editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
    editorCtx.drawImage(editorState.retouchCanvas, 0, 0);
  }
}

function handleEditorPointerMove(event) {
  moveBrushCursor(event);

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

  if (editorState.mode === "retouch") {
    healSpot(retouchCtx, point.x, point.y, Number(brushRange.value));
    editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
    editorCtx.drawImage(editorState.retouchCanvas, 0, 0);
  }
}

function handleEditorPointerUp() {
  if (!editorState.item || !editorState.isDrawing) return;
  editorState.isDrawing = false;
  editorState.lastMaskPoint = null;
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

function handleFormatChange(formatEl, backgroundEl) {
  syncFormatAndBackground(formatEl, backgroundEl);

  if (editorState.item && formatEl === editorOutputFormat) {
    setTransparencyPreview(editorBackgroundMode.value === "transparent");
    redrawEditor(true);
  }
}

function getBatchOutputSettings() {
  return {
    format: outputFormat.value,
    background:
      outputFormat.value === "jpg" || outputFormat.value === "jpeg"
        ? "white"
        : backgroundMode.value,
    width: normalizeDimension(outputWidth.value, 1000),
    height: normalizeDimension(outputHeight.value, 1000),
  };
}

filesInput.addEventListener("change", updateFileName);
bindDragAndDrop();

outputFormat.addEventListener("change", () => handleFormatChange(outputFormat, backgroundMode));
editorOutputFormat.addEventListener("change", () => handleFormatChange(editorOutputFormat, editorBackgroundMode));

backgroundMode.addEventListener("change", () => {
  if (outputFormat.value === "jpg" || outputFormat.value === "jpeg") {
    backgroundMode.value = "white";
  }
});

editorBackgroundMode.addEventListener("change", () => {
  if (editorOutputFormat.value === "jpg" || editorOutputFormat.value === "jpeg") {
    editorBackgroundMode.value = "white";
  }
  setTransparencyPreview(editorBackgroundMode.value === "transparent");
  if (editorState.item) redrawEditor(true);
});

clearBtn.addEventListener("click", () => {
  filesInput.value = "";
  fileName.textContent = "Nenhum ficheiro selecionado";
  setStatus("Aguardando envio das imagens.");
  resetResult();
});

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

  const batchSettings = getBatchOutputSettings();

  outputWidth.value = batchSettings.width;
  outputHeight.value = batchSettings.height;

  const formData = new FormData();
  Array.from(filesInput.files).forEach((file) => formData.append("files", file));

  formData.append("margin_percent", "8");
  formData.append("jpeg_quality", "95");
  formData.append("output_format", batchSettings.format);
  formData.append("background_mode", batchSettings.background);
  formData.append("output_width", String(batchSettings.width));
  formData.append("output_height", String(batchSettings.height));

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

    window.__photopeg_items = data.items || [];

    finishLoadingSuccess();
    setStatus(
      `Concluído.\nImagens processadas: ${data.count}\nFormato final: ${String(
        data.output_format
      ).toUpperCase()}\nFundo: ${
        data.background_mode === "transparent" ? "transparente" : "branco"
      }\nTamanho: ${data.output_width}x${data.output_height} px`
    );

    resultText.textContent = `Lote concluído com ${data.count} imagem(ns).`;
    zipDownloadBtn.href = data.zip_url;
    resultBox.classList.add("active");
    renderGallery(window.__photopeg_items);
  } catch (error) {
    console.error("Erro ao processar lote:", error);
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
      setStatus("Modo Retocar ativo. Arraste o pincel circular sobre a mancha ou logo.");
    }
  });
});

viewZoomRange.addEventListener("input", () => {
  updateSliderLabels();
  applyViewZoom();
});

[
  zoomRange,
  posXRange,
  posYRange,
  lightRange,
  brightnessRange,
  contrastRange,
  temperatureRange,
  sharpnessRange,
  brushRange,
].forEach((input) => {
  input.addEventListener("input", () => {
    updateSliderLabels();
    if (editorState.item) {
      redrawEditor(true);
      saveHistory();
    }
  });
});

[editorOutputWidth, editorOutputHeight].forEach((input) => {
  input.addEventListener("change", () => {
    input.value = String(normalizeDimension(input.value, 1000));
    if (editorState.item) {
      redrawEditor(true);
      saveHistory();
    }
  });
});

editorCanvas.addEventListener("mousedown", handleEditorPointerDown);
editorCanvas.addEventListener("mousemove", handleEditorPointerMove);
editorCanvas.addEventListener("mouseenter", updateBrushCursorVisibility);
editorCanvas.addEventListener("mouseleave", hideBrushCursor);
window.addEventListener("mouseup", handleEditorPointerUp);

closeEditorBtn.addEventListener("click", closeEditor);
resetBtn.addEventListener("click", resetEditor);
saveBtn.addEventListener("click", saveEditor);
renameInEditorBtn.addEventListener("click", renameCurrentEditorItem);

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
  if (event.target === editorModal) closeEditor();
});

window.__photopeg_items = [];

syncFormatAndBackground(outputFormat, backgroundMode);
syncFormatAndBackground(editorOutputFormat, editorBackgroundMode);
updateSliderLabels();
applyViewZoom();
setTransparencyPreview(false);
setToolMode("view");

runIntroLoading()
  .then(() => {
    setStatus("Ambiente pronto para uso.");
  })
  .catch((error) => {
    console.error("Erro na inicialização:", error);
    introOverlay.classList.add("hidden");
    setStatus("Ambiente carregado com aviso.");
  });
