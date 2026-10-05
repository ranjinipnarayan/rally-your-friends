import * as THREE from "three";

export function mountCar(canvas: HTMLCanvasElement) {
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
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-5, 5, 1.2, -1.2, 0.1, 100);
  camera.position.set(0, 0, 8);
  camera.lookAt(0, 0, 0);
  const car = new THREE.Group();
  const paint = new THREE.MeshBasicMaterial({ color: 0x101112 });
  const tailLight = new THREE.MeshBasicMaterial({ color: 0xd92828 });
  const glass = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const rubber = new THREE.MeshBasicMaterial({ color: 0x202124 });
  const hub = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // Flat silhouettes, viewed straight on: no depth, perspective, or lighting.
  function silhouette(
    points: [number, number][],
    material: THREE.Material,
    z = 0,
  ) {
    const shape = new THREE.Shape();
    points.forEach(([x, y], index) => {
      if (index === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
    shape.closePath();
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
    mesh.position.z = z;
    car.add(mesh);
  }
  // Match Rally's favicon: a black hatchback in side profile, red tail light.
  silhouette(
    [
      [-0.6, -0.07],
      [-0.59, 0.12],
      [-0.48, 0.27],
      [-0.52, 0.31],
      [-0.24, 0.37],
      [0.04, 0.38],
      [0.23, 0.32],
      [0.4, 0.22],
      [0.67, 0.14],
      [0.72, 0.04],
      [0.7, -0.07],
    ],
    paint,
  );
  silhouette(
    [
      [-0.38, 0.25],
      [-0.28, 0.3],
      [-0.28, 0.21],
    ],
    glass,
    0.01,
  );
  silhouette(
    [
      [-0.24, 0.3],
      [-0.06, 0.32],
      [-0.04, 0.19],
      [-0.24, 0.2],
    ],
    glass,
    0.01,
  );
  silhouette(
    [
      [0.01, 0.32],
      [0.18, 0.28],
      [0.34, 0.18],
      [0.03, 0.19],
    ],
    glass,
    0.01,
  );
  silhouette(
    [
      [-0.59, 0.13],
      [-0.56, 0.18],
      [-0.53, 0.11],
    ],
    tailLight,
    0.01,
  );
  const wheels: THREE.Group[] = [];
  for (const x of [-0.37, 0.48]) {
    const wheel = new THREE.Group();
    wheel.position.set(x, -0.08, 0.02);
    wheel.add(new THREE.Mesh(new THREE.CircleGeometry(0.135, 24), rubber));
    car.add(wheel);
    wheels.push(wheel);
  }
  car.scale.setScalar(0.65);
  car.position.y = -0.075;
  scene.add(car);
  let target = -4;
  car.position.x = target;
  let frame = 0;
  let previous = 0;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  function render(time = 0) {
    const dt = Math.min((time - previous) / 1000 || 0.016, 0.05);
    previous = time;
    const delta = target - car.position.x;
    const movement = motion.matches ? delta : delta * (1 - Math.exp(-dt * 7));
    car.position.x += movement;
    wheels.forEach((wheel) => {
      wheel.rotation.z -= movement / 0.13;
    });
    renderer.render(scene, camera);
    frame =
      Math.abs(target - car.position.x) > 0.002 && !document.hidden
        ? requestAnimationFrame(render)
        : 0;
  }
  function wake() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(render);
  }
  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    renderer.setSize(width, height, false);
    camera.top = (5 * height) / Math.max(width, 1);
    camera.bottom = -camera.top;
    camera.updateProjectionMatrix();
    wake();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  document.addEventListener("visibilitychange", wake);
  motion.addEventListener("change", wake);
  resize();
  return {
    drive(step: number) {
      target = -4 + step * 4;
      wake();
    },
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", wake);
      motion.removeEventListener("change", wake);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      [paint, tailLight, glass, rubber, hub].forEach((material) =>
        material.dispose(),
      );
      renderer.dispose();
    },
  };
}
