// Procedural billboarded character sprite. Programmer art per the design
// doc — replace once the gameplay validates and the art style is chosen.

import * as THREE from 'three';

export function createPlayerSprite() {
  const tex = drawWizardTexture();
  const material = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.1,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  // Anchor at bottom-centre so the sprite stands on the floor.
  sprite.center.set(0.5, 0);
  // Sized so the wizard reads as ~6 voxels tall — voxel "Steve scale".
  // Walls of 10 voxels, props of 1-3 voxels, characters of 6 voxels gives
  // the dense, detail-rich voxel feel the design doc commits to.
  sprite.scale.set(3.0, 6.0, 1);
  return sprite;
}

function drawWizardTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = Math.floor(size * 1.5);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;

  const cx = c.width / 2;
  const h = c.height;

  // Robe
  g.fillStyle = '#3b4ea0';
  g.beginPath();
  g.moveTo(cx - 28, h * 0.45);
  g.lineTo(cx + 28, h * 0.45);
  g.lineTo(cx + 42, h * 0.96);
  g.lineTo(cx - 42, h * 0.96);
  g.closePath();
  g.fill();

  // Robe trim
  g.fillStyle = '#2a3a78';
  g.fillRect(cx - 42, h * 0.93, 84, 6);

  // Head
  g.fillStyle = '#e8c89c';
  g.beginPath();
  g.arc(cx, h * 0.36, 16, 0, Math.PI * 2);
  g.fill();

  // Hat
  g.fillStyle = '#23306a';
  g.beginPath();
  g.moveTo(cx - 22, h * 0.32);
  g.lineTo(cx + 22, h * 0.32);
  g.lineTo(cx, h * 0.06);
  g.closePath();
  g.fill();

  // Hat brim
  g.fillStyle = '#1a2454';
  g.fillRect(cx - 26, h * 0.30, 52, 6);

  // Eyes (peeking under hat)
  g.fillStyle = '#1a1a1a';
  g.fillRect(cx - 8, h * 0.36, 3, 3);
  g.fillRect(cx + 5, h * 0.36, 3, 3);

  // Staff
  g.strokeStyle = '#6b4a2a';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(cx + 30, h * 0.20);
  g.lineTo(cx + 38, h * 0.95);
  g.stroke();

  // Staff orb
  g.fillStyle = '#7be0ff';
  g.beginPath();
  g.arc(cx + 28, h * 0.18, 7, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(cx + 26, h * 0.16, 2, 0, Math.PI * 2);
  g.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
