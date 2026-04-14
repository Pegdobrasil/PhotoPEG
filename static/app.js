const form = document.getElementById("uploadForm");
const filesInput = document.getElementById("files");
const fileName = document.getElementById("fileName");
const statusBox = document.getElementById("status");
const submitBtn = document.getElementById("submitBtn");
const clearBtn = document.getElementById("clearBtn");

const loadingOverlay = document.getElementById("loadingOverlay");
const loadingSubtitle = document.getElementById("loadingSubtitle");
const loadingCurrentStep = document.getElementById("loadingCurrentStep");
const loadingPercent = document.getElementById("loadingPercent");
const loadingBarFill = document.getElementById("loadingBarFill");
const loadingSteps = Array.from(document.querySelectorAll(".loading-step"));

let loadingSimulationTimer = null;
let currentProgress = 0;

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
    { progress: 82, step: 4, label: "Gerando arquivos..." },
    { progress: 96, step: 5, label: "Finalizando..." },
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

filesInput.addEventListener("change", () => {
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
});

clearBtn.addEventListener("click", () => {
  filesInput.value = "";
  fileName.textContent = "Nenhum ficheiro selecionado";
  setStatus("Aguardando envio das imagens.");
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

  const formData = new FormData();
  Array.from(filesInput.files).forEach((file) => formData.append("files", file));

  formData.append("margin_percent", "8");
  formData.append("jpeg_quality", "95");
  formData.append("zoom_percent", "100");
  formData.append("offset_x", "0");
  formData.append("offset_y", "0");

  submitBtn.disabled = true;
  setStatus("Processando lote... aguarde.");
  startLoadingSimulation(filesInput.files.length);

  try {
    const data = await xhrPostJson("/api/process-preview", formData, (uploadPercent) => {
      const mapped = 8 + Math.round(uploadPercent * 0.16);
      setLoadingProgress(Math.min(mapped, 24), "Enviando ao servidor...");
      setLoadingStep(2, "enviando");
    });

    finishLoadingSuccess();
    setStatus(`Concluído.\nImagens processadas: ${data.items.length}\nLote enviado com sucesso.`);
  } catch (error) {
    finishLoadingError(error.message);
    setStatus(error.message || "Falha ao processar o lote.");
  } finally {
    submitBtn.disabled = false;
  }
});
