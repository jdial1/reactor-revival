#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function removeConsoleStatements(content) {
    let result = content;
    
    const consoleMethods = ['log', 'debug', 'info', 'warn', 'error', 'group', 'groupCollapsed', 'groupEnd', 'table', 'time', 'timeEnd', 'trace'];
    
    for (const method of consoleMethods) {
        const patterns = [
            new RegExp(`console\\.${method}\\s*\\([^)]*\\)\\s*;?`, 'g'),
            new RegExp(`console\\.${method}\\s*\\([^)]*\\)\\s*;?\\s*$`, 'gm')
        ];
        
        for (const pattern of patterns) {
            result = result.replace(pattern, '');
        }
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

function processFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const modified = removeConsoleStatements(content);
        
        if (content !== modified) {
            fs.writeFileSync(filePath, modified, 'utf8');
            return true;
        }
        return false;
    } catch (error) {
        console.error(`Error processing ${filePath}:`, error.message);
        return false;
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

    const jsFiles = walkDirectory(srcDir);
    let modifiedCount = 0;

    for (const file of jsFiles) {
        const relativePath = path.relative(path.join(__dirname, '..'), file);
        if (processFile(file)) {
            console.log(`✓ Removed console statements from: ${relativePath}`);
            modifiedCount++;
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

    console.log(`\n✓ Process complete. Modified ${modifiedCount} file(s).`);
}

removeConsoleLogs().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
});
