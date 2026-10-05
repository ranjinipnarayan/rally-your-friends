import * as THREE from "three";

export function mountFlag(canvas: HTMLCanvasElement) {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(18, 18, false);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1.2, 1.2, 1.2, -1.2, 0.1, 10);
  camera.position.z = 4;
  // Bake the outline into the cloth so it follows every wave deformation.
  const width = 64;
  const height = 48;
  const border = 3;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const edge =
        x < border || x >= width - border || y < border || y >= height - border;
      const white = (Math.floor(x / 16) + Math.floor(y / 16)) % 2 === 1;
      const shade = !edge && white ? 255 : 18;
      data.set([shade, shade, shade, 255], (y * width + x) * 4);
    }
  const texture = new THREE.DataTexture(data, width, height);
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  const fabric = new THREE.PlaneGeometry(1.5, 1, 20, 12);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
  });
  const flag = new THREE.Mesh(fabric, material);
  flag.position.set(0.05, 0.38, 0);
  scene.add(flag);
  const poleGeometry = new THREE.PlaneGeometry(0.09, 1.9);
  const poleMaterial = new THREE.MeshBasicMaterial({ color: 0x121212 });
  const pole = new THREE.Mesh(poleGeometry, poleMaterial);
  pole.position.set(-0.74, -0.12, 0.01);
  scene.add(pole);
  const positions = fabric.getAttribute("position");
  const rest = new Float32Array(positions.array);
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let frame = 0;
  let started = 0;
  function render(now: number) {
    const elapsed = (now - started) / 1000;
    const envelope = motion.matches
      ? 0
      : Math.max(0, Math.sin(Math.min(elapsed / 1.8, 1) * Math.PI));
    for (let i = 0; i < positions.count; i++) {
      const x = rest[i * 3]!;
      const y = rest[i * 3 + 1]!;
      const freeEdge = (x + 0.75) / 1.5;
      const ripple =
        Math.sin(freeEdge * 7 - elapsed * 10) * freeEdge * envelope;
      positions.setXYZ(i, x, y + ripple * 0.13, ripple * 0.28);
    }
    positions.needsUpdate = true;
    renderer.render(scene, camera);
    frame =
      elapsed < 1.8 && !motion.matches && !document.hidden
        ? requestAnimationFrame(render)
        : 0;
  }
  function wave() {
    cancelAnimationFrame(frame);
    started = performance.now();
    if (!document.hidden) frame = requestAnimationFrame(render);
  }
  function visibility() {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else wave();
  }
  document.addEventListener("visibilitychange", visibility);
  motion.addEventListener("change", wave);
  canvas.parentElement?.classList.add("flag-ready");
  wave();
  const waveInterval = window.setInterval(() => {
    if (!motion.matches && !document.hidden) wave();
  }, 3000);
  return {
    wave,
    dispose() {
      window.clearInterval(waveInterval);
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", visibility);
      motion.removeEventListener("change", wave);
      canvas.parentElement?.classList.remove("flag-ready");
      fabric.dispose();
      poleGeometry.dispose();
      material.dispose();
      poleMaterial.dispose();
      texture.dispose();
      renderer.dispose();
    },
  };
}
