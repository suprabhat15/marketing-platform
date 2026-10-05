const fs = require('fs');
const path = require('path');

const CONFIG = {
  include: ['app', 'lib', 'components', 'prisma', 'hooks', 'utils'],
  exclude: ['node_modules', '.next', '.git', 'dist', 'build'],
  extensions: ['.ts', '.tsx', '.js', '.jsx']
};

let stats = {
  files: 0,
  lines: 0,
  todos: 0,
  dangerousEval: 0,
  maxComplexity: 0,
  complexFiles: [],
  deeplyNestedFiles: [],
  securityIssues: [],
  duplicationMap: new Map(), // contentHash -> [files]
  highDuplication: 0
};

// Heuristic for Cyclomatic Complexity
function calculateComplexity(content) {
  const matches = content.match(/\b(if|else|while|for|case|catch|throw|return|&&|\|\||\?)\b/g);
  return matches ? matches.length + 1 : 1;
}

// Heuristic for Max Nesting Depth
function calculateNesting(content) {
  let maxDepth = 0;
  let currentDepth = 0;
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Count leading spaces/tabs (assuming 2 spaces or 1 tab = 1 level)
    const leadingSpace = line.match(/^(\s*)/)[0];
    const indent = leadingSpace.includes('\t') ? leadingSpace.length : Math.ceil(leadingSpace.length / 2);
    
    // Adjust for closing braces which naturally dedent
    if (trimmed.startsWith('}') || trimmed.startsWith(']')) {
      currentDepth = Math.max(0, indent); // Reset to current indentation
    } else {
      currentDepth = indent;
    }
    
    if (currentDepth > maxDepth) maxDepth = currentDepth;
  }
  return maxDepth;
}

function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  stats.files++;
  stats.lines += lines.length;

  // 1. Maintainability: TODOs
  const todoMatch = content.match(/\/\/\s*(TODO|FIXME)/gi);
  if (todoMatch) stats.todos += todoMatch.length;

  // 2. Security: Dangerous Patterns
  if (content.match(/\beval\(/)) {
    stats.dangerousEval++;
    stats.securityIssues.push({ file: filePath, issue: 'Usage of eval()' });
  }
  if (content.match(/dangerouslySetInnerHTML/)) {
    stats.securityIssues.push({ file: filePath, issue: 'React dangerouslySetInnerHTML' });
  }

  // 3. Complexity
  const complexity = calculateComplexity(content);
  if (complexity > 30) {
    stats.complexFiles.push({ file: filePath, score: complexity });
  }
  if (complexity > stats.maxComplexity) stats.maxComplexity = complexity;

  // 4. Nesting
  const nesting = calculateNesting(content);
  if (nesting > 6) { // > 6 levels is very hard to read
    stats.deeplyNestedFiles.push({ file: filePath, depth: nesting });
  }

  // 5. Duplication (Simple Content Hash)
  // Normalize whitespace to catch logic duplication
  const normalized = content.replace(/\s+/g, ''); 
  if (normalized.length > 100) { // Ignore tiny files
    const hash = normalized.slice(0, 500); // Compare first 500 chars normalized as signature
    if (stats.duplicationMap.has(hash)) {
        stats.duplicationMap.get(hash).push(filePath);
    } else {
        stats.duplicationMap.set(hash, [filePath]);
    }
  }
}

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!CONFIG.exclude.includes(item)) scanDir(fullPath);
    } else {
      const ext = path.extname(item);
      if (CONFIG.extensions.includes(ext)) {
        analyzeFile(fullPath);
      }
    }
  }
}

// === RUN ===
console.log('Starting Analysis...');
CONFIG.include.forEach(dir => scanDir(dir));

// Process Duplication
let duplicatedGroups = 0;
stats.duplicationMap.forEach((files) => {
    if (files.length > 1) {
        duplicatedGroups++;
        stats.highDuplication += files.length;
    }
});

// Output Report JSON
const report = {
  metrics: {
    files: stats.files,
    linesOfCode: stats.lines,
    complexity: {
      max: stats.maxComplexity,
      highComplexityFiles: stats.complexFiles.sort((a,b) => b.score - a.score).slice(0, 5)
    },
    nesting: {
      deeplyNestedFiles: stats.deeplyNestedFiles.length
    },
    maintainability: {
      todos: stats.todos,
      duplicationGroups: duplicatedGroups
    },
    security: {
      issues: stats.securityIssues
    }
  },
  scoreComponents: {
    complexityPenalty: Math.min(3, stats.complexFiles.length * 0.2), // Max 3 pts off
    securityPenalty: Math.min(4, stats.securityIssues.length * 0.5), // Max 4 pts off
    maintainabilityPenalty: Math.min(3, (stats.todos * 0.05) + (duplicatedGroups * 0.2)) // Max 3 pts off
  }
};

console.log(JSON.stringify(report, null, 2));
