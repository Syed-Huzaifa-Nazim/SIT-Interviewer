// Static named imports (not `import * as THREE`) so Rollup can tree-shake this down to
// only the classes actually used, instead of bundling the entire three.js library (§1.2).
// This file is reached only via a dynamic import() from NeuralHero.jsx, so it — and only
// the pieces of `three` it references — lands in its own lazy-loaded chunk.
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Group,
  BufferGeometry,
  BufferAttribute,
  Points,
  PointsMaterial,
  LineSegments,
  LineBasicMaterial,
  Clock,
} from 'three';

const THEME_COLORS = {
  dark: { point: 0x60a5fa, line: 0x0d6db7 },
  light: { point: 0x0d6db7, line: 0x8dc63f },
};

/**
 * Builds and mounts the neural-network hero scene into `container`, wires up resize +
 * pointer-parallax + the render loop (skipped entirely when `reduceMotion` is true, per
 * §1.2), and returns handles the caller uses to react to theme changes and to tear
 * everything down on unmount.
 */
export function createNeuralScene(container, { isDark, reduceMotion }) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  const scene = new Scene();
  const camera = new PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.z = 9;

  const group = new Group();
  scene.add(group);

  // Nodes: a modest particle count kept low deliberately (§1.2) — this is a decorative
  // accent, not a data visualization, so it never needs to be dense.
  const NODE_COUNT = 90;
  const positions = new Float32Array(NODE_COUNT * 3);
  const spread = 6;
  for (let i = 0; i < NODE_COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * spread * 1.6;
    positions[i * 3 + 1] = (Math.random() - 0.5) * spread;
    positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
  }
  const pointsGeo = new BufferGeometry();
  pointsGeo.setAttribute('position', new BufferAttribute(positions, 3));

  const colors = isDark ? THEME_COLORS.dark : THEME_COLORS.light;

  const pointsMat = new PointsMaterial({
    color: colors.point,
    size: 0.09,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
  });
  const points = new Points(pointsGeo, pointsMat);
  group.add(points);

  // Edges: connect each node to its nearest few neighbours only (bounded work, no O(n^2)
  // blow-up risk) so the "neural network" read comes through without a dense mesh.
  const linePositions = [];
  const MAX_LINKS_PER_NODE = 3;
  const MAX_DIST = 2.1;
  for (let i = 0; i < NODE_COUNT; i++) {
    const ax = positions[i * 3], ay = positions[i * 3 + 1], az = positions[i * 3 + 2];
    const dists = [];
    for (let j = 0; j < NODE_COUNT; j++) {
      if (i === j) continue;
      const bx = positions[j * 3], by = positions[j * 3 + 1], bz = positions[j * 3 + 2];
      const d = Math.hypot(ax - bx, ay - by, az - bz);
      if (d < MAX_DIST) dists.push([d, j]);
    }
    dists.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < Math.min(MAX_LINKS_PER_NODE, dists.length); k++) {
      const j = dists[k][1];
      linePositions.push(ax, ay, az, positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]);
    }
  }
  const lineGeo = new BufferGeometry();
  lineGeo.setAttribute('position', new BufferAttribute(new Float32Array(linePositions), 3));
  const lineMat = new LineBasicMaterial({ color: colors.line, transparent: true, opacity: 0.18 });
  const lines = new LineSegments(lineGeo, lineMat);
  group.add(lines);

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = container;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);
  renderer.domElement.className = 'w-full h-full';
  resize();

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(container);
  window.addEventListener('resize', resize);

  // Mouse parallax: a gentle camera tilt toward the pointer, lerped for smoothness.
  const pointer = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };
  const handlePointerMove = (e) => {
    const rect = container.getBoundingClientRect();
    target.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    target.y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
  };
  if (!reduceMotion) window.addEventListener('pointermove', handlePointerMove);

  let rafId = null;
  const clock = new Clock();
  const renderFrame = () => {
    const t = clock.getElapsedTime();
    pointsMat.opacity = 0.7 + Math.sin(t * 0.6) * 0.15;
    renderer.render(scene, camera);
  };

  if (reduceMotion) {
    // Static: render exactly one frame, then never touch the animation loop again.
    renderFrame();
  } else {
    const animate = () => {
      pointer.x += (target.x - pointer.x) * 0.04;
      pointer.y += (target.y - pointer.y) * 0.04;
      group.rotation.y += 0.0015;
      group.rotation.x = pointer.y * 0.15;
      group.rotation.y += pointer.x * 0.0005;
      renderFrame();
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);
  }

  return {
    updateTheme(nextIsDark) {
      const next = nextIsDark ? THEME_COLORS.dark : THEME_COLORS.light;
      pointsMat.color.set(next.point);
      lineMat.color.set(next.line);
    },
    cleanup() {
      if (rafId) cancelAnimationFrame(rafId);
      ro?.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', handlePointerMove);
      pointsGeo.dispose();
      pointsMat.dispose();
      lineGeo.dispose();
      lineMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
