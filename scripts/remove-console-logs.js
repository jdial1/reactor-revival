#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { ESLint } from "eslint";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let eslintInstance = null;

async function initializeESLint() {
    if (!eslintInstance) {
        const configPath = path.join(__dirname, '..', 'config', 'eslint.config.js');
        try {
            const configUrl = pathToFileURL(configPath).href;
            const config = await import(configUrl);
            eslintInstance = new ESLint({
                baseConfig: config.default,
                ignore: false
            });
        } catch (error) {
            eslintInstance = new ESLint({
                overrideConfigFile: configPath,
                ignore: false
            });
        }
    }
    return eslintInstance;
}

async function lintFile(filePath, content) {
    try {
        const eslint = await initializeESLint();
        const results = await eslint.lintText(content, {
            filePath: filePath
        });
        
        if (results.length === 0) {
            return { valid: true, errors: [] };
        }
        
        const result = results[0];
        const errors = result.messages.filter(msg => msg.severity === 2);
        
        return {
            valid: errors.length === 0,
            errors: errors.map(e => ({
                line: e.line,
                column: e.column,
                message: e.message,
                ruleId: e.ruleId
            }))
        };
    } catch (error) {
        return {
            valid: false,
            errors: [{ message: error.message }]
        };
    }
}

function findBalancedParens(text, startPos) {
    let depth = 0;
    let inString = false;
    let stringChar = null;
    let inTemplate = false;
    let templateExprDepth = 0;
    let i = startPos;
    
    for (; i < text.length; i++) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : '';
        const nextChar = i < text.length - 1 ? text[i + 1] : '';
        
        if (!inString && !inTemplate) {
            if (char === '"' || char === "'") {
                inString = true;
                stringChar = char;
            } else if (char === '`') {
                inTemplate = true;
                templateExprDepth = 0;
            } else if (char === '(') {
                depth++;
            } else if (char === ')') {
                depth--;
                if (depth === 0) {
                    return i + 1;
                }
            }
        } else if (inString) {
            if (char === stringChar && prevChar !== '\\') {
                inString = false;
                stringChar = null;
            }
        } else if (inTemplate) {
            if (char === '`' && prevChar !== '\\') {
                if (templateExprDepth === 0) {
                    inTemplate = false;
                }
            } else if (char === '$' && nextChar === '{') {
                templateExprDepth++;
                i++;
            } else if (char === '{' && prevChar !== '$') {
                if (templateExprDepth > 0) {
                    depth++;
                }
            } else if (char === '}' && templateExprDepth > 0) {
                if (depth > 0) {
                    depth--;
                }
                templateExprDepth--;
            } else if (char === '(' && templateExprDepth > 0) {
                depth++;
            } else if (char === ')' && templateExprDepth > 0) {
                depth--;
            }
        }
    }
    
    return -1;
}

function removeConsoleStatements(content) {
    const consoleMethods = ['log', 'debug', 'info', 'warn', 'error', 'group', 'groupCollapsed', 'groupEnd', 'table', 'time', 'timeEnd', 'trace'];
    let result = content;
    const removals = [];
    
    for (const method of consoleMethods) {
        const pattern = new RegExp(`console\\.${method}\\s*\\(`, 'g');
        let match;
        
        while ((match = pattern.exec(result)) !== null) {
            const start = match.index;
            const openParenPos = start + match[0].length - 1;
            const end = findBalancedParens(result, openParenPos);
            
            if (end > 0) {
                let statementEnd = end;
                let hasSemicolon = false;
                let tempEnd = end;
                
                while (tempEnd < result.length && /\s/.test(result[tempEnd])) {
                    tempEnd++;
                }
                
                if (result[tempEnd] === ';') {
                    hasSemicolon = true;
                    statementEnd = tempEnd + 1;
                }
                
                while (statementEnd < result.length && /\s/.test(result[statementEnd])) {
                    statementEnd++;
                }
                
                removals.push({ start, end: statementEnd, hasSemicolon });
            }
        }
    }
    
    if (removals.length === 0) {
        return content;
    }
    
    removals.sort((a, b) => b.start - a.start);
    
    for (const removal of removals) {
        const before = result.substring(0, removal.start);
        const after = result.substring(removal.end);
        
        const replacement = removal.hasSemicolon ? "void(0);" : "void(0)";
        
        result = before + replacement + after;
    }
    
    const lines = result.split('\n');
    const cleanedLines = [];
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed === ';') {
            if (cleanedLines.length === 0 || cleanedLines[cleanedLines.length - 1] !== '') {
                cleanedLines.push('');
            }
        } else if (!/^\s*console\./.test(line)) {
            cleanedLines.push(line);
        }
    }
    
    return cleanedLines.join('\n');
}

function addProductionFlag(htmlContent) {
    if (htmlContent.includes('window.PRODUCTION_BUILD')) {
        return htmlContent;
    }
    
    const scriptTag = '<script>window.PRODUCTION_BUILD = true;</script>';
    
    if (htmlContent.includes('</head>')) {
        return htmlContent.replace('</head>', `  ${scriptTag}\n</head>`);
    }
    
    if (htmlContent.includes('<body>')) {
        return htmlContent.replace('<body>', `<body>\n  ${scriptTag}`);
    }
    
    return htmlContent;
}

async function processFile(filePath) {
    try {
        const originalContent = fs.readFileSync(filePath, 'utf8');
        const modified = removeConsoleStatements(originalContent);
        
        if (originalContent === modified) {
            return { modified: false, kept: false };
        }
        
        const lintResult = await lintFile(filePath, modified);
        
        if (!lintResult.valid) {
            console.warn(`⚠ Linting failed for ${path.relative(path.join(__dirname, '..'), filePath)}:`);
            lintResult.errors.forEach(err => {
                if (err.line) {
                    console.warn(`  Line ${err.line}:${err.column || ''} - ${err.message}`);
                } else {
                    console.warn(`  ${err.message}`);
                }
            });
            console.warn(`  Keeping original console statements in file.\n`);
            return { modified: false, kept: true };
        }
        
        fs.writeFileSync(filePath, modified, 'utf8');
        return { modified: true, kept: false };
    } catch (error) {
        console.error(`Error processing ${filePath}:`, error.message);
        return { modified: false, kept: true };
    }
}

function walkDirectory(dir, fileList = []) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            walkDirectory(filePath, fileList);
        } else if (file.endsWith('.js')) {
            fileList.push(filePath);
        }
    }

    return fileList;
}

async function removeConsoleLogs() {
    const srcDir = path.join(__dirname, '..', 'public', 'src');
    
    if (!fs.existsSync(srcDir)) {
        console.error(`Source directory not found: ${srcDir}`);
        process.exit(1);
    }

    console.log('Removing console statements from JavaScript files...\n');
    console.log('Note: Files will be linted after removal. If linting fails, console statements will be kept.\n');

    const jsFiles = walkDirectory(srcDir);
    let modifiedCount = 0;
    let keptCount = 0;

    for (const file of jsFiles) {
        const relativePath = path.relative(path.join(__dirname, '..'), file);
        const result = await processFile(file);
        
        if (result.modified) {
            console.log(`✓ Removed console statements from: ${relativePath}`);
            modifiedCount++;
        } else if (result.kept) {
            keptCount++;
        }
    }

    const indexHtmlPath = path.join(__dirname, '..', 'public', 'index.html');
    if (fs.existsSync(indexHtmlPath)) {
        let htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
        const originalHtml = htmlContent;
        
        htmlContent = htmlContent.replace(/console\.(log|debug|info|warn|error|group|groupCollapsed|groupEnd)\s*\([^)]*\)\s*;?/g, '');
        htmlContent = addProductionFlag(htmlContent);
        
        if (htmlContent !== originalHtml) {
            fs.writeFileSync(indexHtmlPath, htmlContent, 'utf8');
            console.log(`✓ Updated: public/index.html`);
            modifiedCount++;
        }
    }

    console.log(`\n✓ Process complete.`);
    console.log(`  Modified: ${modifiedCount} file(s)`);
    if (keptCount > 0) {
        console.log(`  Kept console statements (linting failed): ${keptCount} file(s)`);
    }
}

removeConsoleLogs().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
});
