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
