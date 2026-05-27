import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage });

// API Routes
app.post('/api/convert', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { toolId, options } = req.body;
  const inputPath = req.file.path;
  const outputDir = path.join(__dirname, 'outputs');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Prepare arguments for Python script
  const args = [inputPath, outputDir];

  // Add tool-specific arguments
  if (toolId === 'pptx') {
    args.push('simple');
  } else if (toolId === 'permissions') {
    args.push('permissions');
  } else if (toolId === 'universal') {
    args.push('universal');
  }

  // Add options if provided
  if (options) {
    try {
      const parsedOptions = JSON.parse(options);
      args.push(JSON.stringify(parsedOptions));
    } catch (e) {
      // Ignore invalid options
    }
  }

  // Spawn Python process
  const pythonProcess = spawn('python', ['python/convert.py', ...args], {
    cwd: __dirname
  });

  let progress = 0;
  let status = '';

  // Handle stdout from Python script
  pythonProcess.stdout.on('data', (data) => {
    const output = data.toString();
    console.log('Python output:', output);

    // Parse progress updates
    const progressMatch = output.match(/PROGRESS:(\d+)/);
    if (progressMatch) {
      progress = parseInt(progressMatch[1]);
    }

    // Parse status updates
    const statusMatch = output.match(/STATUS:(.+)/);
    if (statusMatch) {
      status = statusMatch[1].trim();
    }
  });

  // Handle stderr
  pythonProcess.stderr.on('data', (data) => {
    console.error('Python error:', data.toString());
  });

  // Handle process completion
  pythonProcess.on('close', (code) => {
    if (code === 0) {
      // Find the output file
      const files = fs.readdirSync(outputDir);
      const outputFile = files.find(file => file.includes(path.parse(req.file.originalname).name));

      if (outputFile) {
        const outputPath = path.join(outputDir, outputFile);
        res.json({
          success: true,
          progress: 100,
          status: 'Conversion completed successfully',
          outputFile: outputFile,
          downloadUrl: `/api/download/${outputFile}`
        });
      } else {
        res.status(500).json({ error: 'Output file not found' });
      }
    } else {
      res.status(500).json({ error: 'Conversion failed' });
    }

    // Clean up input file
    fs.unlinkSync(inputPath);
  });

  // Send initial response
  res.json({
    success: true,
    progress: 0,
    status: 'Starting conversion...'
  });
});

// Download route
app.get('/api/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'outputs', filename);

  if (fs.existsSync(filePath)) {
    res.download(filePath, filename, (err) => {
      if (!err) {
        // Clean up output file after download
        fs.unlinkSync(filePath);
      }
    });
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
