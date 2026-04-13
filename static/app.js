const form = document.getElementById("uploadForm");
const filesInput = document.getElementById("files");
const statusBox = document.getElementById("status");
const submitBtn = document.getElementById("submitBtn");
const zipBtn = document.getElementById("zipBtn");
const clearBtn = document.getElementById("clearBtn");
const previewGrid = document.getElementById("previewGrid");
const emptyState = document.getElementById("emptyState");

const marginInput = document.getElementById("margin_percent");
const jpegQualityInput = document.getElementById("jpeg_quality");
const zoomPercentInput = document.getElementById("zoom_percent");
const offsetXInput = document.getElementById("offset_x");
const offsetYInput = document.getElementById("offset_y");

const editorModal = document.getElementById("editorModal");
const closeEditorBtn = document.getElementById("closeEditorBtn");
const modalTitle = document.getElementById("modalTitle");
const editorCanvas = document.getElementById("editorCanvas");
const editorPreviewFinal = document.getElementById("editorPreviewFinal");

const brushSizeInput = document.getElementById("brushSize");
const editorZoomViewInput = document.getElementById("editorZoomView");
const editorMarginInput = document.getElementById("editorMargin");
const editorFinalZoomInput = document.getElementById("editorFinalZoom");
const editorOffsetXInput = document.getElementById("editorOffsetX");
const editorOffsetYInput = document.getElementById("editorOffsetY");
const editorJpegQualityInput = document.getElementById("editorJpegQuality");

const saveMaskBtn = document.getElementById("saveMaskBtn");
const downloadCurrentBtn = document.getElementById("downloadCurrentBtn");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const fitBtn = document.getElementById("fitBtn");
const toolButtons = Array.from(document.querySelectorAll(".tool-btn[data-tool]"));

const loadingOverlay = document.getElementById("loadingOverlay");
const loadingSubtitle = document.getElementById("loadingSubtitle");
const loadingCurrentStep = document.getElementById("loadingCurrentStep");
const loadingPercent = document.getElementById("loadingPercent");
const loadingBarFill = document.getElementById("loadingBarFill");
const loadingSteps = Array.from(document.querySelectorAll(".loading-step"));

let batchZipUrl = "#";
let itemsState = {};
let loadingSimulationTimer = null;
let currentProgress = 0;

const editor = {
  imageId: null,
  item: null,
  baseImage: null,
  maskCanvas: document.createElement("canvas"),
  maskCtx: null,
  compositeCanvas: document.createElement("canvas"),
  compositeCtx: null,
  ctx: editorCanvas.getContext("2d"),
  tool: "erase",
  drawing: false,
  panning: false,
  zoom: 1,
  panX: 0,
  panY: 0,
  lastPoint: null,
  history: [],
  historyIndex: -1,
};

editor.maskCtx = editor.maskCanvas.getContext("2d");
editor.compositeCtx = editor.compositeCanvas.getContext("2d");

function cacheBust(url) {
  return `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
}

function setStatus(message) {
  statusBox.textContent = message;
}

function resetPanel() {
  itemsState = {};
  batchZipUrl = "#";
  previewGrid.innerHTML = "";
  previewGrid.style.display = "none";
  emptyState.style.display = "block";
  setStatus("Aguardando envio das imagens.");
}

function updateSliderValue(input) {
  const outputId = input.dataset.output;
  if (!outputId) return;
  const output = document.getElementById(outputId);
  if (!output) return;
  const suffix = input.dataset.suffix || "";
  output.textContent = `${input.value}${suffix}`;
}

function initSliders() {
  const sliders = Array.from(document.querySelectorAll('input[type="range"][data-output]'));
  sliders.forEach((slider) => {
    updateSliderValue(slider);
    slider.addEventListener("input", () => updateSliderValue(slider));
  });
}

function createSliderControl(label, className, value, min, max, step = 1, suffix = "") {
  const outputId = `${className}_${Math.random().toString(36).slice(2, 8)}`;
  return `
    <div class="control-mini">
      <label>${label}</label>
      <div class="slider-wrap">
        <div class="slider-head">
          <span>Ajuste</span>
          <span class="slider-value" id="${outputId}">${value}${suffix}</span>
        </div>
        <input
          class="${className}"
          type="range"
          min="${min}"
          max="${max}"
          step="${step}"
          value="${value}"
          data-output="${outputId}"
          data-suffix="${suffix}"
        >
      </div>
    </div>
  `;
}

function createCard(item) {
  const card = document.createElement("div");
  card.className = "preview-card";
  card.dataset.imageId = item.image_id;

  const params = item.params || {};

  card.innerHTML = `
    <div class="preview-top">
      <div class="preview-name">${item.filename}</div>
      <div class="preview-badge">Recorte processado</div>
    </div>

    <div class="compare-wrap">
      <div class="image-box">
        <div class="image-label">Original</div>
        <div class="image-stage">
          <img src="${cacheBust(item.original_url)}" alt="Imagem original">
        </div>
      </div>

      <div class="image-box">
        <div class="image-label">Editada</div>
        <div class="image-stage">
          <img src="${cacheBust(item.preview_url)}" alt="Imagem editada">
        </div>
      </div>
    </div>

    <div class="preview-controls">
      ${createSliderControl("Margem (%)", "card-margin", params.margin_percent ?? 8, 0, 30, 1, "%")}
      ${createSliderControl("Zoom (%)", "card-zoom", params.zoom_percent ?? 100, 50, 250, 1, "%")}
      ${createSliderControl("Posição X", "card-offset-x", params.offset_x ?? 0, -500, 500, 1, "")}
      ${createSliderControl("Posição Y", "card-offset-y", params.offset_y ?? 0, -500, 500, 1, "")}
    </div>

    <div class="preview-actions">
      <button type="button" class="btn btn-secondary btn-reprocess">Reprocessar</button>
      <button type="button" class="btn btn-secondary btn-edit-mask">Corrigir recorte</button>
      <button type="button" class="btn btn-success btn-download">Baixar JPG</button>
    </div>
  `;

  card.querySelector(".btn-reprocess").addEventListener("click", async () => {
    await reprocessFromCard(item.image_id);
  });

  card.querySelector(".btn-edit-mask").addEventListener("click", async () => {
    await openEditor(item.image_id);
  });

  card.querySelector(".btn-download").addEventListener("click", () => {
    window.open(item.download_url, "_blank");
  });

  card.querySelectorAll('input[type="range"][data-output]').forEach((slider) => {
    updateSliderValue(slider);
    slider.addEventListener("input", () => updateSliderValue(slider));
  });

  return card;
}

function renderItems() {
  const items = Object.values(itemsState);

  if (!items.length) {
    previewGrid.innerHTML = "";
    previewGrid.style.display = "none";
    emptyState.style.display = "block";
    return;
  }

  emptyState.style.display = "none";
  previewGrid.style.display = "grid";
  previewGrid.innerHTML = "";

  items.forEach((item) => {
    previewGrid.appendChild(createCard(item));
  });
}

function updateItemState(item) {
  itemsState[item.image_id] = item;
  renderItems();
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

function setLoadingProgress(value, stepLabel = "") {
  currentProgress = Math.max(0, Math.min(100, value));
  loadingPercent.textContent = `${Math.round(currentProgress)}%`;
  loadingBarFill.style.width = `${currentProgress}%`;
  if (stepLabel) loadingCurrentStep.textContent = stepLabel;
}

function showLoading() {
  currentProgress = 0;
  resetLoadingSteps();
  setLoadingProgress(0, "Preparando lote...");
  loadingSubtitle.textContent = "Aguarde enquanto o sistema envia, recorta, padroniza e prepara o painel comparativo.";
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
    { progress: 8, step: 1, label: "Separando arquivos do lote..." },
    { progress: 24, step: 2, label: "Enviando imagens ao servidor..." },
    { progress: 58, step: 3, label: `Removendo fundo e gerando máscara em ${fileCount} imagem(ns)...` },
    { progress: 82, step: 4, label: "Montando prévias e comparativo..." },
    { progress: 96, step: 5, label: "Finalizando painel de revisão..." },
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

  setLoadingProgress(100, "Painel pronto para revisão.");
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

async function processBatch(event) {
  event.preventDefault();

  if (!filesInput.files.length) {
    setStatus("Selecione ao menos uma imagem.");
    return;
  }

  if (filesInput.files.length > 10) {
    setStatus("Envie no máximo 10 imagens por vez.");
    return;
  }

  const formData = new FormData();
  Array.from(filesInput.files).forEach((file) => formData.append("files", file));

  formData.append("margin_percent", marginInput.value || "8");
  formData.append("jpeg_quality", jpegQualityInput.value || "95");
  formData.append("zoom_percent", zoomPercentInput.value || "100");
  formData.append("offset_x", offsetXInput.value || "0");
  formData.append("offset_y", offsetYInput.value || "0");

  submitBtn.disabled = true;
  setStatus("Processando lote... aguarde.");
  startLoadingSimulation(filesInput.files.length);

  try {
    const data = await xhrPostJson("/api/process-preview", formData, (uploadPercent) => {
      const mapped = 8 + Math.round(uploadPercent * 0.16);
      setLoadingProgress(Math.min(mapped, 24), "Enviando imagens ao servidor...");
      setLoadingStep(2, "enviando");
    });

    itemsState = {};
    data.items.forEach((item) => {
      itemsState[item.image_id] = item;
    });

    batchZipUrl = data.zip_url || "#";
    renderItems();
    finishLoadingSuccess();

    setStatus(`Concluído.\nImagens processadas: ${data.items.length}\nAgora você pode revisar, corrigir o recorte e baixar cada imagem.`);
  } catch (error) {
    finishLoadingError(error.message);
    setStatus(error.message || "Falha ao processar o lote.");
  } finally {
    submitBtn.disabled = false;
  }
}

async function reprocessFromCard(imageId) {
  const item = itemsState[imageId];
  const card = document.querySelector(`.preview-card[data-image-id="${imageId}"]`);
  if (!item || !card) return;

  const margin = Number(card.querySelector(".card-margin").value || 8);
  const zoom = Number(card.querySelector(".card-zoom").value || 100);
  const offsetX = Number(card.querySelector(".card-offset-x").value || 0);
  const offsetY = Number(card.querySelector(".card-offset-y").value || 0);
  const jpegQuality = Number(item.params?.jpeg_quality || jpegQualityInput.value || 95);

  setStatus(`Reprocessando ${item.filename}...`);

  try {
    const response = await fetch(`/api/reprocess/${imageId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        margin_percent: margin,
        zoom_percent: zoom,
        offset_x: offsetX,
        offset_y: offsetY,
        jpeg_quality: jpegQuality,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Falha ao reprocessar a imagem.");
    }

    updateItemState(data.item);
    setStatus(`Imagem atualizada: ${data.item.filename}`);
  } catch (error) {
    setStatus(error.message || "Falha ao reprocessar a imagem.");
  }
}

function fitEditorView() {
  if (!editor.baseImage) return;

  const canvas = editorCanvas;
  const imgW = editor.baseImage.width;
  const imgH = editor.baseImage.height;

  const scaleX = (canvas.width * 0.9) / imgW;
  const scaleY = (canvas.height * 0.9) / imgH;
  editor.zoom = Math.min(scaleX, scaleY);
  editor.panX = 0;
  editor.panY = 0;
  editorZoomViewInput.value = Math.round(editor.zoom * 100);
  updateSliderValue(editorZoomViewInput);
  drawEditor();
}

function resizeEditorCanvas() {
  const wrap = editorCanvas.parentElement;
  const rect = wrap.getBoundingClientRect();

  const dpr = window.devicePixelRatio || 1;
  editorCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
  editorCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
  editorCanvas.style.width = `${rect.width}px`;
  editorCanvas.style.height = `${rect.height}px`;
  editor.ctx.setTransform(1, 0, 0, 1, 0, 0);
  editor.ctx.scale(dpr, dpr);

  drawEditor();
}

function saveHistorySnapshot() {
  if (!editor.maskCanvas.width || !editor.maskCanvas.height) return;
  const snapshot = editor.maskCtx.getImageData(0, 0, editor.maskCanvas.width, editor.maskCanvas.height);
  editor.history = editor.history.slice(0, editor.historyIndex + 1);
  editor.history.push(snapshot);
  if (editor.history.length > 20) {
    editor.history.shift();
  }
  editor.historyIndex = editor.history.length - 1;
}

function restoreHistorySnapshot(index) {
  if (index < 0 || index >= editor.history.length) return;
  editor.historyIndex = index;
  const snapshot = editor.history[index];
  editor.maskCtx.putImageData(snapshot, 0, 0);
  drawEditor();
}

function updateCompositeCanvas() {
  if (!editor.baseImage) return;

  const w = editor.baseImage.width;
  const h = editor.baseImage.height;

  editor.compositeCanvas.width = w;
  editor.compositeCanvas.height = h;

  const ctx = editor.compositeCtx;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(editor.baseImage, 0, 0);

  const imgData = ctx.getImageData(0, 0, w, h);
  const maskData = editor.maskCtx.getImageData(0, 0, w, h).data;

  for (let i = 0; i < imgData.data.length; i += 4) {
    imgData.data[i + 3] = maskData[i];
  }

  ctx.putImageData(imgData, 0, 0);
}

function drawEditor() {
  const ctx = editor.ctx;
  const canvas = editorCanvas;
  if (!ctx) return;

  const displayWidth = parseFloat(canvas.style.width || "0");
  const displayHeight = parseFloat(canvas.style.height || "0");

  ctx.clearRect(0, 0, displayWidth, displayHeight);
  if (!editor.baseImage) return;

  updateCompositeCanvas();

  const imgW = editor.baseImage.width;
  const imgH = editor.baseImage.height;

  const x = (displayWidth - imgW * editor.zoom) / 2 + editor.panX;
  const y = (displayHeight - imgH * editor.zoom) / 2 + editor.panY;
  const w = imgW * editor.zoom;
  const h = imgH * editor.zoom;

  ctx.drawImage(editor.compositeCanvas, x, y, w, h);
  drawBrushPreview();
  updateEditorPreviewThumb();
}

function drawBrushPreview() {
  if (!editor.baseImage || editor.tool === "pan" || !editor.lastPoint) return;

  const ctx = editor.ctx;
  const radius = Number(brushSizeInput.value || 28) / 2;
  const drawRadius = radius * editor.zoom;

  ctx.save();
  ctx.beginPath();
  ctx.arc(editor.lastPoint.canvasX, editor.lastPoint.canvasY, Math.max(4, drawRadius), 0, Math.PI * 2);
  ctx.strokeStyle = editor.tool === "erase" ? "#ff5f7a" : "#17b26a";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function getTransform() {
  const displayWidth = parseFloat(editorCanvas.style.width || "0");
  const displayHeight = parseFloat(editorCanvas.style.height || "0");
  const imgW = editor.baseImage.width;
  const imgH = editor.baseImage.height;

  const x = (displayWidth - imgW * editor.zoom) / 2 + editor.panX;
  const y = (displayHeight - imgH * editor.zoom) / 2 + editor.panY;

  return { x, y };
}

function canvasPointToImagePoint(canvasX, canvasY) {
  if (!editor.baseImage) return null;

  const { x, y } = getTransform();
  const imgX = (canvasX - x) / editor.zoom;
  const imgY = (canvasY - y) / editor.zoom;

  if (imgX < 0 || imgY < 0 || imgX > editor.baseImage.width || imgY > editor.baseImage.height) {
    return { imgX, imgY, outside: true };
  }

  return { imgX, imgY, outside: false };
}

function drawOnMask(fromPoint, toPoint) {
  const ctx = editor.maskCtx;
  const brushSize = Number(brushSizeInput.value || 28);

  ctx.save();
  ctx.strokeStyle = editor.tool === "erase" ? "black" : "white";
  ctx.fillStyle = editor.tool === "erase" ? "black" : "white";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = brushSize;

  ctx.beginPath();
  ctx.moveTo(fromPoint.imgX, fromPoint.imgY);
  ctx.lineTo(toPoint.imgX, toPoint.imgY);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(toPoint.imgX, toPoint.imgY, brushSize / 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function updateEditorPreviewThumb() {
  const item = editor.item;
  if (!item) return;

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = 1000;
  tempCanvas.height = 1000;
  const tempCtx = tempCanvas.getContext("2d");

  tempCtx.fillStyle = "#ffffff";
  tempCtx.fillRect(0, 0, 1000, 1000);

  updateCompositeCanvas();

  const source = editor.compositeCanvas;
  const bbox = getAlphaBoundingBox(source);

  if (!bbox) {
    editorPreviewFinal.src = cacheBust(item.preview_url);
    return;
  }

  const croppedCanvas = document.createElement("canvas");
  croppedCanvas.width = bbox.w;
  croppedCanvas.height = bbox.h;
  const croppedCtx = croppedCanvas.getContext("2d");
  croppedCtx.drawImage(source, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, bbox.w, bbox.h);

  const margin = Number(editorMarginInput.value || 8);
  const zoomFinal = Number(editorFinalZoomInput.value || 100);
  const offsetX = Number(editorOffsetXInput.value || 0);
  const offsetY = Number(editorOffsetYInput.value || 0);

  const marginPx = Math.floor(1000 * (margin / 100));
  const maxW = 1000 - marginPx * 2;
  const maxH = 1000 - marginPx * 2;

  const fitScale = Math.min(maxW / bbox.w, maxH / bbox.h);
  const finalScale = fitScale * (zoomFinal / 100);

  const finalW = Math.max(1, Math.round(bbox.w * finalScale));
  const finalH = Math.max(1, Math.round(bbox.h * finalScale));

  const x = Math.round((1000 - finalW) / 2 + offsetX);
  const y = Math.round((1000 - finalH) / 2 + offsetY);

  tempCtx.drawImage(croppedCanvas, x, y, finalW, finalH);
  editorPreviewFinal.src = tempCanvas.toDataURL("image/jpeg", 0.95);
}

function getAlphaBoundingBox(canvas) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;

  let minX = width, minY = height, maxX = -1, maxY = -1;

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

async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = cacheBust(src);
  });
}

async function loadMaskIntoCanvas(maskUrl, width, height) {
  const img = await loadImage(maskUrl);
  editor.maskCanvas.width = width;
  editor.maskCanvas.height = height;
  editor.maskCtx.clearRect(0, 0, width, height);
  editor.maskCtx.drawImage(img, 0, 0, width, height);
}

async function openEditor(imageId) {
  const item = itemsState[imageId];
  if (!item) return;

  setStatus(`Abrindo editor para ${item.filename}...`);

  try {
    const baseImage = await loadImage(item.isolated_url);
    editor.baseImage = baseImage;
    editor.item = item;
    editor.imageId = imageId;

    await loadMaskIntoCanvas(item.mask_url, baseImage.width, baseImage.height);

    editor.compositeCanvas.width = baseImage.width;
    editor.compositeCanvas.height = baseImage.height;

    editor.history = [];
    editor.historyIndex = -1;
    saveHistorySnapshot();

    modalTitle.textContent = `Correção manual do recorte — ${item.filename}`;

    editorMarginInput.value = item.params.margin_percent ?? 8;
    editorFinalZoomInput.value = item.params.zoom_percent ?? 100;
    editorOffsetXInput.value = item.params.offset_x ?? 0;
    editorOffsetYInput.value = item.params.offset_y ?? 0;
    editorJpegQualityInput.value = item.params.jpeg_quality ?? 95;
    editorZoomViewInput.value = 100;
    brushSizeInput.value = 28;

    [
      brushSizeInput,
      editorZoomViewInput,
      editorMarginInput,
      editorFinalZoomInput,
      editorOffsetXInput,
      editorOffsetYInput,
      editorJpegQualityInput,
    ].forEach(updateSliderValue);

    editorModal.classList.add("active");

    setTimeout(() => {
      resizeEditorCanvas();
      fitEditorView();
      drawEditor();
    }, 50);

    setStatus(`Editor aberto: ${item.filename}`);
  } catch {
    setStatus("Não foi possível abrir o editor manual.");
  }
}

function closeEditor() {
  editorModal.classList.remove("active");
  editor.imageId = null;
  editor.item = null;
  editor.baseImage = null;
}

async function saveEditorChanges() {
  const item = editor.item;
  if (!item) return;

  saveMaskBtn.disabled = true;
  setStatus(`Salvando correção de recorte em ${item.filename}...`);

  try {
    const response = await fetch(`/api/reprocess/${item.image_id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        margin_percent: Number(editorMarginInput.value || 8),
        zoom_percent: Number(editorFinalZoomInput.value || 100),
        offset_x: Number(editorOffsetXInput.value || 0),
        offset_y: Number(editorOffsetYInput.value || 0),
        jpeg_quality: Number(editorJpegQualityInput.value || 95),
        mask_data_url: editor.maskCanvas.toDataURL("image/png"),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Falha ao salvar a correção.");
    }

    itemsState[item.image_id] = data.item;
    renderItems();
    editor.item = data.item;
    editorPreviewFinal.src = cacheBust(data.item.preview_url);
    setStatus(`Correção salva: ${data.item.filename}`);
  } catch (error) {
    setStatus(error.message || "Falha ao salvar a correção.");
  } finally {
    saveMaskBtn.disabled = false;
  }
}

function setTool(tool) {
  editor.tool = tool;
  toolButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tool === tool);
  });
  editorCanvas.style.cursor = tool === "pan" ? "grab" : "crosshair";
}

function getCanvasCoords(event) {
  const rect = editorCanvas.getBoundingClientRect();
  return {
    canvasX: event.clientX - rect.left,
    canvasY: event.clientY - rect.top,
  };
}

function handlePointerDown(event) {
  if (!editor.baseImage) return;

  const pt = getCanvasCoords(event);
  const imgPt = canvasPointToImagePoint(pt.canvasX, pt.canvasY);
  editor.lastPoint = { ...pt };

  if (editor.tool === "pan") {
    editor.panning = true;
    return;
  }

  if (imgPt?.outside) return;

  editor.drawing = true;
  editor.lastPoint = { ...pt, ...imgPt };
  drawOnMask(imgPt, imgPt);
  drawEditor();
}

function handlePointerMove(event) {
  if (!editor.baseImage) return;

  const pt = getCanvasCoords(event);
  const imgPt = canvasPointToImagePoint(pt.canvasX, pt.canvasY);
  editor.lastPoint = { ...pt };

  if (editor.panning) {
    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;
    editor.panX += movementX;
    editor.panY += movementY;
    drawEditor();
    return;
  }

  if (!editor.drawing || !imgPt || imgPt.outside) {
    drawEditor();
    return;
  }

  const from = editor.lastPoint && editor.lastPoint.imgX !== undefined ? editor.lastPoint : imgPt;
  drawOnMask(from, imgPt);
  editor.lastPoint = { ...pt, ...imgPt };
  drawEditor();
}

function handlePointerUp() {
  if (editor.drawing) {
    editor.drawing = false;
    saveHistorySnapshot();
  }
  editor.panning = false;
}

function handleWheel(event) {
  if (!editor.baseImage) return;
  event.preventDefault();

  const delta = event.deltaY < 0 ? 1.08 : 0.92;
  editor.zoom *= delta;
  editor.zoom = Math.max(0.2, Math.min(6, editor.zoom));
  editorZoomViewInput.value = Math.round(editor.zoom * 100);
  updateSliderValue(editorZoomViewInput);
  drawEditor();
}

function bindGlobalEvents() {
  form.addEventListener("submit", processBatch);

  zipBtn.addEventListener("click", () => {
    if (batchZipUrl && batchZipUrl !== "#") {
      window.open(batchZipUrl, "_blank");
    } else {
      setStatus("Ainda não há um lote processado para baixar.");
    }
  });

  clearBtn.addEventListener("click", () => {
    filesInput.value = "";
    resetPanel();
  });

  closeEditorBtn.addEventListener("click", closeEditor);
  saveMaskBtn.addEventListener("click", saveEditorChanges);

  downloadCurrentBtn.addEventListener("click", () => {
    if (editor.item?.download_url) {
      window.open(editor.item.download_url, "_blank");
    }
  });

  undoBtn.addEventListener("click", () => {
    if (editor.historyIndex > 0) restoreHistorySnapshot(editor.historyIndex - 1);
  });

  redoBtn.addEventListener("click", () => {
    if (editor.historyIndex < editor.history.length - 1) restoreHistorySnapshot(editor.historyIndex + 1);
  });

  fitBtn.addEventListener("click", fitEditorView);

  toolButtons.forEach((btn) => {
    btn.addEventListener("click", () => setTool(btn.dataset.tool));
  });

  editorZoomViewInput.addEventListener("input", () => {
    editor.zoom = Math.max(0.2, Math.min(6, Number(editorZoomViewInput.value || 100) / 100));
    updateSliderValue(editorZoomViewInput);
    drawEditor();
  });

  [
    brushSizeInput,
    editorMarginInput,
    editorFinalZoomInput,
    editorOffsetXInput,
    editorOffsetYInput,
    editorJpegQualityInput,
  ].forEach((input) => {
    input.addEventListener("input", () => {
      updateSliderValue(input);
      updateEditorPreviewThumb();
    });
  });

  editorCanvas.addEventListener("mousedown", handlePointerDown);
  editorCanvas.addEventListener("mousemove", handlePointerMove);
  window.addEventListener("mouseup", handlePointerUp);
  editorCanvas.addEventListener("wheel", handleWheel, { passive: false });
  window.addEventListener("resize", resizeEditorCanvas);

  editorModal.addEventListener("click", (event) => {
    if (event.target === editorModal) closeEditor();
  });
}

bindGlobalEvents();
initSliders();
resetPanel();
