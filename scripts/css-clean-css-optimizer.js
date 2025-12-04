#!/usr/bin/env node

import CleanCSS from 'clean-css';
import postcss from 'postcss';
import combineDuplicatedSelectors from 'postcss-combine-duplicated-selectors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const cssPath = path.join(rootDir, 'public', 'css', 'main.css');

const input = fs.readFileSync(cssPath, 'utf8');

const options = {
  level: {
    1: {
      cleanupCharsets: true,
      normalizeUrls: true,
      optimizeBackground: true,
      optimizeBorderRadius: true,
      optimizeFilter: true,
      optimizeFont: true,
      optimizeFontWeight: true,
      optimizeOutline: true,
      removeEmpty: true,
      removeNegativePaddings: true,
      removeQuotes: true,
      removeWhitespace: true,
      replaceMultipleZeros: true,
      replaceTimeUnits: true,
      replaceZeroUnits: true,
      roundingPrecision: false,
      selectorsSortingMethod: 'standard',
      specialComments: 'all',
      tidyAtRules: true,
      tidyBlockScopes: true,
      tidySelectors: true,
      variableValueOptimizers: []
    },
    2: {
      mergeAdjacentRules: true,
      mergeIntoShorthands: true,
      mergeMedia: true,
      mergeNonAdjacentRules: true,
      mergeSemantically: false,
      overrideProperties: true,
      removeEmpty: true,
      reduceNonAdjacentRules: true,
      removeDuplicateFontRules: true,
      removeDuplicateMediaBlocks: true,
      removeDuplicateRules: true,
      removeUnusedAtRules: false,
      restructureRules: false,
      skipProperties: []
    }
  },
  format: {
    indentBy: 2,
    indentWith: 'space',
    breaks: {
      afterAtRule: true,
      afterBlockBegins: true,
      afterBlockEnds: true,
      afterComment: true,
      afterRuleBegins: true,
      afterRuleEnds: true,
      beforeBlockEnds: true,
      betweenSelectors: true
    }
  }
};

(async () => {
const originalSize = Buffer.byteLength(input, 'utf8');

console.log('Step 1: Combining duplicated selectors with postcss...');
const postcssResult = await postcss([
  combineDuplicatedSelectors({
    removeDuplicatedProperties: true
  })
]).process(input, { from: cssPath });

if (postcssResult.warnings && postcssResult.warnings.length > 0) {
  console.warn('PostCSS Warnings:', postcssResult.warnings);
}

const postcssSize = Buffer.byteLength(postcssResult.css, 'utf8');
const postcssSavings = originalSize - postcssSize;
const postcssSavingsPercent = ((postcssSavings / originalSize) * 100).toFixed(2);

console.log(`  After PostCSS: ${(postcssSize / 1024).toFixed(2)} KB (${postcssSavingsPercent}% reduction)`);

console.log('Step 2: Optimizing with clean-css (Level 1 & 2)...');
const cleanCssOutput = new CleanCSS(options).minify(postcssResult.css);

if (cleanCssOutput.errors && cleanCssOutput.errors.length > 0) {
  console.error('CleanCSS Errors:', cleanCssOutput.errors);
  process.exit(1);
}

if (cleanCssOutput.warnings && cleanCssOutput.warnings.length > 0) {
  console.warn('CleanCSS Warnings:', cleanCssOutput.warnings);
}

const finalSize = Buffer.byteLength(cleanCssOutput.styles, 'utf8');
const totalSavings = originalSize - finalSize;
const totalSavingsPercent = ((totalSavings / originalSize) * 100).toFixed(2);

console.log(`\nFinal Results:`);
console.log(`  Original size: ${(originalSize / 1024).toFixed(2)} KB`);
console.log(`  After PostCSS: ${(postcssSize / 1024).toFixed(2)} KB (${postcssSavingsPercent}% reduction)`);
console.log(`  Final size: ${(finalSize / 1024).toFixed(2)} KB`);
console.log(`  Total savings: ${(totalSavings / 1024).toFixed(2)} KB (${totalSavingsPercent}%)`);

fs.writeFileSync(cssPath, cleanCssOutput.styles, 'utf8');
console.log(`\n✓ Optimized CSS written to ${cssPath}`);
})();

