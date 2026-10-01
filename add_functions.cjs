const fs = require('fs');
const filePath = "C:\\Users\\user\\Documents\\Backup\\sargagame\\.ai\\ux-agent\\opencode-auto.cjs";
let content = fs.readFileSync(filePath, 'utf8');

// We want to insert the new functions after the checkOllama function and before the main function.
// The checkOllama function ends with: "   });\n}\n\nasync function main()"
// We'll split the content at that point.
const marker = "   });\n}\n\nasync function main()";
const parts = content.split(marker);
if (parts.length !== 2) {
  console.error('Marker not found');
  console.log('Content around the area:');
  const lines = content.split('\n');
  for (let i = 90; i < 105; i++) {
    console.log(`${i+1}: ${lines[i]}`);
  }
  process.exit(1);
}

// The new functions to insert
const newFunctions = `

/**
 * Charge les métriques des modèles depuis .ai/autopilot/model-metrics.json
 * @returns {Array<{backendId:string, taskType:string, successRate:number, latencyMs:number, lastUpdated:string}>}
 */
function loadModelMetrics() {
  const metricsPath = require('path').join(__dirname, '..', '..', 'autopilot', 'model-metrics.json');
  try {
    const data = fs.readFileSync(metricsPath, 'utf8');
    const metrics = JSON.parse(data);
    // Assurez-vous que c'est un tableau
    return Array.isArray(metrics) ? metrics : [];
  } catch (err) {
    // Si le fichier n'existe pas ou est invalide, retournez un tableau vide
    return [];
  }
}

/**
 * Classe le type de tâche basé sur les arguments utilisateur
 * @param {string[]} userArgs - Les arguments passés à opencode
 * @returns {string} - Type de tâche (ex: 'coding', 'debugging', 'analysis', 'etc')
 */
function classifyTaskType(userArgs) {
  // Joindre les arguments en une seule chaîne pour l'analyse
  const argsString = userArgs.join(' ').toLowerCase();
  
  // Mots-clés pour différents types de tâches
  const taskPatterns = {
    coding: ['write', 'create', 'implement', 'add', 'build', 'make', 'code', 'function', 'class'],
    debugging: ['fix', 'debug', 'error', 'bug', 'issue', 'problem', 'fail', 'broken'],
    analysis: ['analyze', 'review', 'check', 'inspect', 'examine', 'audit', 'assess'],
    refactoring: ['refactor', 'restructure', 'reorganize', 'clean', 'simplify', 'optimize'],
    testing: ['test', 'spec', 'unit', 'integration', 'e2e', 'jest', 'mocha', 'vitest'],
    documentation: ['doc', 'document', 'readme', 'comment', 'explain', 'tutorial'],
    planning: ['plan', 'design', 'architecture', 'structure', 'outline', 'specify']
  };
  
  // Compter les correspondances pour chaque type de tâche
  const scores = {};
  for (const [type, patterns] of Object.entries(taskPatterns)) {
    let score = 0;
    for (const pattern of patterns) {
      if (argsString.includes(pattern)) {
        score++;
      }
    }
    scores[type] = score;
  }
  
  // Trouver le type avec le score le plus élevé
  let bestType = 'etc'; // Type par défaut
  let maxScore = 0;
  for (const [type, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      bestType = type;
    }
  }
  
  // Si aucun mot-clé trouvé, retourner 'etc'
  return maxScore > 0 ? bestType : 'etc';
}

/**
 * Calcule un score pour un backend donné basé sur les métriques pour un type de tâche
 * @param {string} backendId - L'identifiant du backend
 * @param {string} taskType - Le type de tâche
 * @param {Array} metrics - Le tableau de métriques chargé
 * @returns {number} - Score entre 0 et 1 (plus élevé est meilleur)
 */
function calculateBackendScore(backendId, taskType, metrics) {
  // Filtrer les métriques pour ce backend et ce type de tâche
  const relevantMetrics = metrics.filter(
    m => m.backendId === backendId && m.taskType === taskType
  );
  
  // Si aucune métrique spécifique, retourner un score neutre
  if (relevantMetrics.length === 0) {
    return 0.5; // Score neutre
  }
  
  // Calculer la moyenne des métriques
  const avgSuccessRate = relevantMetrics.reduce((sum, m) => sum + (m.successRate || 0), 0) / relevantMetrics.length;
  const avgLatency = relevantMetrics.reduce((sum, m) => sum + (m.latencyMs || 0), 0) / relevantMetrics.length;
  
  // Normaliser la latence : on suppose qu'une latence inférieure à 1000ms est bonne, au-delà de 5000ms est mauvaise
  const normalizedLatency = Math.max(0, Math.min(1, 1 - (avgLatency - 1000) / 4000));
  
  // Combiner le taux de succès et la latence (on peut ajuster les poids)
  // 70% taux de succès, 30% latence inverse
  return 0.7 * avgSuccessRate + 0.3 * normalizedLatency;
}

/**
 * Trie les backends par score pour un type de tâche donné
 * @param {Array} backends - Le tableau de backends
 * @param {string} taskType - Le type de tâche
 * @param {Array} metrics - Le tableau de métriques chargé
 * @returns {Array} - Nouvel tableau de backends trié par score décroissant
 */
function sortBackendsByTaskType(backends, taskType, metrics) {
  // Retourner une copie triée du tableau de backends
  return [...backends].sort((a, b) => {
    const scoreA = calculateBackendScore(a.id, taskType, metrics);
    const scoreB = calculateBackendScore(b.id, taskType, metrics);
    // Trier par ordre décroissant (meilleur score en premier)
    return scoreB - scoreA;
  });
}`;

// Rejoindre les parties avec les nouvelles fonctions au milieu
const newContent = parts[0] + marker.replace('async function main()', newFunctions + '\n\nasync function main()');
fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Functions added successfully');