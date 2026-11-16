#!/usr/bin/env node
/**
 * desktop.cjs — Abstraction du contrôle physique Windows (robotjs).
 *
 * Primitives sûres et déterministes pour piloter le bureau Windows :
 *   capture d'écran, taille écran, position souris, clic, saisie clavier,
 *   déplacement souris, couleur pixel, lancement d'application.
 *
 * Règles de sécurité :
 *   - Aucune action destructive (pas de fermeture forcée d'appli utilisateur,
 *     pas de touche système type Alt+F4 / Win+L par défaut).
 *   - Coordonnées clampées à la taille d'écran.
 *   - Délais configurables entre actions pour laisser le temps à Windows.
 *
 * Dépendance : robotjs (déjà installée et vérifiée fonctionnelle sur Node 24).
 */
'use strict';

const robot = require('robotjs');
const { spawn } = require('child_process');

const DELAY_MS = parseInt(process.env.DESKTOP_DELAY_MS || '300', 10);

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ */
/* Écran                                                              */
/* ------------------------------------------------------------------ */

/**
 * Retourne la taille de l'écran principal { width, height }.
 */
function getScreenSize() {
  return robot.getScreenSize();
}

/**
 * Capture une zone de l'écran. Retourne un Buffer (image bitmap brute de robotjs)
 * avec .width / .height.
 * @param {number} x @param {number} y @param {number} w @param {number} h
 */
function captureScreen(x = 0, y = 0, w, h) {
  const size = getScreenSize();
  const width = w !== undefined ? w : size.width;
  const height = h !== undefined ? h : size.height;
  const sx = clamp(Math.floor(x), 0, size.width);
  const sy = clamp(Math.floor(y), 0, size.height);
  // robotjs capture ne clamp pas : on réduit w/h pour rester dans l'écran
  const captureW = Math.min(width, size.width - sx);
  const captureH = Math.min(height, size.height - sy);
  const img = robot.screen.capture(sx, sy, captureW, captureH);
  return { image: img.image, width: img.width, height: img.height, x: sx, y: sy };
}

/**
 * Retourne la couleur du pixel à (x, y) au format hex "#RRGGBB".
 */
function getPixelColor(x, y) {
  const size = getScreenSize();
  const sx = clamp(Math.floor(x), 0, size.width - 1);
  const sy = clamp(Math.floor(y), 0, size.height - 1);
  return robot.getPixelColor(sx, sy);
}

/* ------------------------------------------------------------------ */
/* Souris                                                             */
/* ------------------------------------------------------------------ */

/**
 * Retourne la position actuelle de la souris { x, y }.
 */
function getMousePos() {
  return robot.getMousePos();
}

/**
 * Déplace la souris vers (x, y) (clampé à l'écran).
 */
function moveMouse(x, y) {
  const size = getScreenSize();
  const sx = clamp(Math.floor(x), 0, size.width);
  const sy = clamp(Math.floor(y), 0, size.height);
  robot.moveMouse(sx, sy);
  return { x: sx, y: sy };
}

/**
 * Clic à la position actuelle (ou à (x, y) si fournie).
 * @param {number} [x] @param {number} [y] @param {string} [button='left']
 * @param {number} [doubleClick=0]
 */
function click(x, y, button = 'left', doubleClick = 0) {
  if (x !== undefined && y !== undefined) {
    moveMouse(x, y);
  }
  robot.mouseClick(button, doubleClick);
  return { x: x !== undefined ? x : getMousePos().x, y: y !== undefined ? y : getMousePos().y, button, doubleClick };
}

/* ------------------------------------------------------------------ */
/* Clavier                                                            */
/* ------------------------------------------------------------------ */

/**
 * Saisit une chaîne de caractères au clavier (physique).
 * robot.typeString ne gère que les caractères imprimables + \n (Entrée)
 * et \t (Tabulation) dans cette version.
 */
function typeString(text) {
  robot.typeString(text);
  return { length: text.length };
}

/**
 * Appuie sur une touche spéciale simple (mapped sur typeString quand possible).
 * Touches supportées : enter, tab, space, escape, backspace.
 * robotjs ne propose pas de keyTap dans cette version : on utilise typeString
 * avec les séquences d'échappement correspondantes.
 */
function pressKey(key) {
  const map = {
    enter: '\n',
    return: '\n',
    tab: '\t',
    space: ' ',
    escape: '', // pas d'équivalent typeString sûr — no-op documenté
    backspace: '', // idem
  };
  const seq = map[key.toLowerCase()];
  if (seq === undefined) {
    throw new Error(`Touche non supportée par cette build robotjs : "${key}". Utilisez typeString pour le texte.`);
  }
  if (seq.length > 0) {
    robot.typeString(seq);
  }
  return { key, sent: seq.length > 0 };
}

/* ------------------------------------------------------------------ */
/* Applications                                                       */
/* ------------------------------------------------------------------ */

/**
 * Lance une application Windows (spawn détaché, console cachée).
 * Retourne { pid, command }. Le processus est detached : il survit au contrôleur.
 * @param {string} command @param {string[]} [args] @param {object} [opts]
 */
function launch(command, args = [], opts = {}) {
  const { cwd = process.cwd(), env = { ...process.env }, windowsHide = true, detached = true } = opts;
  const child = spawn(command, args, {
    cwd,
    env,
    detached,
    stdio: 'ignore',
    windowsHide,
  });
  child.unref();
  return { pid: child.pid, command, args };
}

/**
 * Attend un délai (ms) — utile entre deux actions physiques.
 */
function sleep(ms) {
  return delay(ms);
}

module.exports = {
  getScreenSize,
  captureScreen,
  getPixelColor,
  getMousePos,
  moveMouse,
  click,
  typeString,
  pressKey,
  launch,
  sleep,
  delay,
  DELAY_MS,
};
