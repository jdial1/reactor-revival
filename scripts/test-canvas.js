import { createCanvas } from 'canvas';
import fs from 'fs';

try {
    console.log('Creating test canvas...');
    const canvas = createCanvas(64, 64);
    const ctx = canvas.getContext('2d');

    console.log('Drawing test image...');
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 64, 64);

    console.log('Converting to buffer...');
    const buffer = canvas.toBuffer('image/png');

    console.log('Buffer length:', buffer.length);

    console.log('Writing to file...');
    fs.writeFileSync('./test-image.png', buffer);

    console.log('Test image created successfully!');
} catch (error) {
    console.error('Error:', error);
}
