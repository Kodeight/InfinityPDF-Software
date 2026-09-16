const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs-extra");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

// Check if we're in development mode based on environment or app path
const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

let mainWindow;

// Active Multi-PDF generation tracking for real cancellation support.
// The Electron layer owns the child process handle; STOP kills the process
// AND touches a cancel flag file that the Python backend polls between
// recipients so no additional files are started after cancellation.
let activeMultiPdfProcess = null;
let multiPdfCancelled = false;
let multiPdfCancelFile = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#000000",
    icon: path.join(__dirname, "../public/favicon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const startUrl = process.env.INFINITYPDF_RENDERER_URL || (isDev
    ? "http://localhost:3000"
    : `file://${path.join(__dirname, "../build/index.html")}`);

  console.log("Loading URL:", startUrl);
  console.log("isDev:", isDev);

  mainWindow.loadURL(startUrl).catch((err) => {
    console.error("Failed to load URL:", err);
  });

  // Handle errors
  mainWindow.webContents.on("crashed", () => {
    console.error("Window crashed");
    app.quit();
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  try {
    if (activeMultiPdfProcess && !activeMultiPdfProcess.killed) {
      activeMultiPdfProcess.kill();
    }
  } catch (e) {}
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC Handlers for System Operations

ipcMain.handle("select-directory", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  return result.filePaths[0];
});

ipcMain.handle("open-path", async (event, folderPath) => {
  if (folderPath) {
    shell.openPath(folderPath);
    return true;
  }
  return false;
});

ipcMain.handle("save-file-dialog", async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result.filePath;
});

// Core Logic: Batch PDF Watermarking (PPTX -> PDF with Watermark via Python)
ipcMain.handle(
  "process-multi-pdf",
  async (event, { sourcePath, sourcePaths, recipients, watermark, outputDir, namingPattern }) => {
    try {
      const { spawn } = require("child_process");

      if (!fs.existsSync(outputDir)) {
        await fs.ensureDir(outputDir);
      }

      const inputPaths = Array.isArray(sourcePaths)
        ? sourcePaths.filter(Boolean)
        : (sourcePath ? [sourcePath] : []);

      if (inputPaths.length === 0) {
        throw new Error("No source files provided");
      }

      // If no recipients selected, treat as simple conversion (1 file, no watermark, no prefix)
      // We pass a single empty string as recipient name, and disable watermark
      let targetRecipients = recipients;
      const hasCustomRecipient = Boolean(watermark?.customWatermarkText?.trim());
      
      if (!recipients || recipients.length === 0) {
        if (hasCustomRecipient) {
          targetRecipients = [];
        } else {
          targetRecipients = [""]; // Dummy recipient for single pass
          watermark.enabled = false; // Force disable watermark
        }
      } else {
        // Normal mode: ensure watermark enabled flag matches UI or default
        if (watermark.enabled === undefined) watermark.enabled = true;
      }

      // Prepare data for Python backend
      const studentList = { students: targetRecipients.map(name => ({ name })) };

      // Reset cancellation state for this job. The cancel file must NOT exist
      // until the user presses STOP; the backend polls for its existence.
      const os = require("os");
      multiPdfCancelled = false;
      multiPdfCancelFile = path.join(os.tmpdir(), `infinitypdf-cancel-${Date.now()}.flag`);
      try { if (fs.existsSync(multiPdfCancelFile)) fs.removeSync(multiPdfCancelFile); } catch (e) {}
      const cancelEnv = { ...process.env, INFINITYPDF_CANCEL_FILE: multiPdfCancelFile };

      const runBackendForSource = (currentSourcePath, sourceIndex) => new Promise((resolve, reject) => {
        if (multiPdfCancelled) {
          resolve({ success: false, cancelled: true, results: [] });
          return;
        }
        let executor, args;
        const sourceWatermark = { ...watermark };

        if (app.isPackaged) {
          // Production: Use bundled EXE
          executor = path.join(process.resourcesPath, "InfinityPDF-backend.exe");
          args = [
            "multi-pdf",
            currentSourcePath,
            outputDir,
            JSON.stringify(studentList),
            JSON.stringify(sourceWatermark)
          ];
        } else {
          // Development: Use python command
          executor = "python";
          args = [
            path.join(__dirname, "../backend.py"),
            "multi-pdf",
            currentSourcePath,
            outputDir,
            JSON.stringify(studentList),
            JSON.stringify(sourceWatermark)
          ];
        }

        // Append naming pattern if provided
        if (namingPattern && namingPattern.trim()) {
          args.push(namingPattern.trim());
        }

        console.log("Spawning backend process for Multi PDF:", executor, args);
        const pythonProcess = spawn(executor, args, { env: cancelEnv });
        activeMultiPdfProcess = pythonProcess;

        let stdout = "";
        let stderr = "";

        pythonProcess.stdout.on("data", (data) => {
          const text = data.toString();
          stdout += text;
          
          // Parse progress updates
          for (const progressMatch of text.matchAll(/PROGRESS:(\d+)/g)) {
            const sourceProgress = parseInt(progressMatch[1], 10);
            const overallProgress = Math.min(
              100,
              Math.floor(((sourceIndex + (sourceProgress / 100)) / inputPaths.length) * 100)
            );
            mainWindow.webContents.send("process-progress", overallProgress);
          }
        });

        pythonProcess.stderr.on("data", (data) => {
          stderr += data.toString();
          console.error("Backend stderr:", data.toString());
        });

        pythonProcess.on("close", (code) => {
          activeMultiPdfProcess = null;
          if (multiPdfCancelled) {
            resolve({ success: false, cancelled: true, results: [] });
            return;
          }
          if (code === 0) {
            try {
              // Parse result from stdout
              const lines = stdout.split('\n');
              const jsonLine = lines.find(l => l.startsWith('{'));
              if (jsonLine) {
                const result = JSON.parse(jsonLine);
                resolve(result);
              } else {
                resolve({ success: true, results: [], outputDir });
              }
            } catch (e) {
              resolve({ success: true, results: [], outputDir });
            }
          } else {
            console.error("Python process failed:", code, stderr);
            reject(new Error(stderr || "PPTX conversion failed"));
          }
        });

        pythonProcess.on("error", (err) => {
          activeMultiPdfProcess = null;
          console.error("Python spawn error:", err);
          if (multiPdfCancelled) {
            resolve({ success: false, cancelled: true, results: [] });
          } else {
            reject(err);
          }
        });
      });

      const combinedResults = [];
      try {
        for (let i = 0; i < inputPaths.length; i++) {
          // Never start another document after cancellation was requested.
          if (multiPdfCancelled) break;
          const result = await runBackendForSource(inputPaths[i], i);
          if (result && result.cancelled) break;
          if (result && result.success === false) {
            throw new Error(result.error || "PPTX conversion failed");
          }
          combinedResults.push(...(result.results || []));
        }
      } finally {
        activeMultiPdfProcess = null;
        try { if (multiPdfCancelFile && fs.existsSync(multiPdfCancelFile)) fs.removeSync(multiPdfCancelFile); } catch (e) {}
      }

      if (multiPdfCancelled) {
        return { success: false, cancelled: true, results: combinedResults, outputDir };
      }

      mainWindow.webContents.send("process-progress", 100);
      return { success: true, results: combinedResults, outputDir };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
);

// Real cancellation: STOP the running Multi-PDF backend process.
// Kills the active child process tree and touches the cancel flag file so the
// Python backend stops before starting the next recipient/document and cleans
// up its temporary base PDF.
ipcMain.handle("cancel-multi-pdf", async () => {
  try {
    multiPdfCancelled = true;
    if (multiPdfCancelFile) {
      try { fs.ensureFileSync(multiPdfCancelFile); } catch (e) {}
    }
    const proc = activeMultiPdfProcess;
    if (proc && !proc.killed) {
      try {
        if (process.platform === "win32" && proc.pid) {
          const { execSync } = require("child_process");
          try {
            execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: "ignore" });
          } catch (e) {
            try { proc.kill("SIGKILL"); } catch (e2) {}
          }
        } else {
          proc.kill("SIGTERM");
        }
      } catch (e) {
        console.error("Cancel kill error:", e);
      }
    }
    return { success: true, cancelled: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Core Logic: Apply PDF Security Permissions
ipcMain.handle(
  "apply-pdf-security",
  async (event, { fileBuffer, inputPath, fileName, permissions, outputDir }) => {
    try {
      const { spawn } = require("child_process");
      const os = require("os");

      // Set default output dir to system temp if not provided
      if (!outputDir) outputDir = path.join(os.tmpdir(), "InfinityPDF_Security_Temp");
      if (!fs.existsSync(outputDir)) {
        await fs.ensureDir(outputDir);
      }

      const tempDir = os.tmpdir();
      let actualInputPath = inputPath;
      
      // If no path provided, use buffer (backwards compatibility/robustness)
      if (!actualInputPath && fileBuffer) {
        actualInputPath = path.join(tempDir, `infinity_input_${Date.now()}.pdf`);
        const uint8Array = new Uint8Array(fileBuffer);
        await fs.writeFile(actualInputPath, Buffer.from(uint8Array));
      }

      if (!actualInputPath) throw new Error("No input file provided");

      const baseName = fileName || path.basename(actualInputPath);
      const outputFileName = baseName.startsWith("SECURED_") ? baseName : `SECURED_${baseName}`;
      const outputPath = path.join(outputDir, outputFileName);

      console.log("Processing PDF with permissions:", permissions);

      return new Promise((resolve, reject) => {
        let executor, args;

        if (app.isPackaged) {
          executor = path.join(process.resourcesPath, "InfinityPDF-backend.exe");
          args = ["apply-security", actualInputPath, JSON.stringify(permissions), outputPath];
        } else {
          executor = "python";
          args = [path.join(__dirname, "../backend.py"), "apply-security", actualInputPath, JSON.stringify(permissions), outputPath];
        }

        const pythonProcess = spawn(executor, args);

        let stdout = "";
        let stderr = "";

        pythonProcess.stdout.on("data", (data) => { stdout += data.toString(); });
        pythonProcess.stderr.on("data", (data) => {
          stderr += data.toString();
          console.error("Backend stderr:", data.toString());
        });

        pythonProcess.on("error", (err) => {
          console.error("Spawn error:", err);
          reject(err);
        });

        pythonProcess.on("close", (code) => {
          if (code === 0 && fs.existsSync(outputPath)) {
            resolve({
              success: true,
              path: outputPath,
              outputDir: outputDir
            });
          } else {
            console.error("Python process failed with code:", code, "stderr:", stderr);
            reject(new Error(stderr || "Security processing failed"));
          }
          
          // Cleanup only if we created a temp input file from buffer
          if (!inputPath && actualInputPath && fs.existsSync(actualInputPath)) {
            try { fs.removeSync(actualInputPath); } catch (e) {}
          }
        });
      });
    } catch (err) {
      console.error("apply-pdf-security error:", err);
      return { success: false, error: err.message };
    }
  }
);

// Universal Converter Logic
// Universal Converter Logic
ipcMain.handle(
  "convert-universal",
  async (event, { inputPath, targetFormat, outputDir }) => {
    try {
      const { spawn } = require("child_process");
      const os = require("os");

      // Set default output dir to system temp if not provided
      if (!outputDir) outputDir = path.join(os.tmpdir(), "InfinityPDF_Universal_Temp");
      if (!fs.existsSync(outputDir)) {
        await fs.ensureDir(outputDir);
      }

      console.log(`Universal Convert: ${inputPath} -> ${targetFormat} (Intermediate: ${outputDir})`);

      return new Promise((resolve, reject) => {
        let executor, args;

        if (app.isPackaged) {
           executor = path.join(process.resourcesPath, "InfinityPDF-backend.exe");
           args = ["universal-convert", inputPath, targetFormat, outputDir];
        } else {
           executor = "python";
           args = [
             path.join(__dirname, "../backend.py"),
             "universal-convert",
             inputPath,
             targetFormat,
             outputDir
           ];
        }

        const pythonProcess = spawn(executor, args);

        let stdout = "";
        let stderr = "";

        pythonProcess.stdout.on("data", (data) => {
          stdout += data.toString();
        });

        pythonProcess.stderr.on("data", (data) => {
          stderr += data.toString();
          console.error("Backend stderr:", data.toString());
        });

        pythonProcess.on("close", (code) => {
          if (code === 0) {
             try {
                // Try to parse the last line as JSON result
                const lines = stdout.trim().split('\n');
                const lastLine = lines[lines.length - 1];
                const result = JSON.parse(lastLine);
                resolve(result);
             } catch (e) {
                console.error("Failed to parse JSON result:", stdout);
                reject(new Error("Invalid backend response"));
             }
          } else {
             reject(new Error(stderr || `Conversion failed with code ${code}`));
          }
        });
      });

    } catch (err) {
      return { success: false, error: err.message };
    }
  }
);

ipcMain.handle("clear-universal-temp", async () => {
  try {
    const os = require("os");
    const tempDir = path.join(os.tmpdir(), "InfinityPDF_Universal_Temp");
    if (fs.existsSync(tempDir)) {
      await fs.emptyDir(tempDir);
    }
    return { success: true };
  } catch (err) {
    console.error("Clear temp error:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("clear-security-temp", async () => {
  try {
    const os = require("os");
    const tempDir = path.join(os.tmpdir(), "InfinityPDF_Security_Temp");
    if (fs.existsSync(tempDir)) {
      await fs.emptyDir(tempDir);
    }
    return { success: true };
  } catch (err) {
    console.error("Clear security temp error:", err);
    return { success: false, error: err.message };
  }
});

// ============================================================================
// NEW TOOLS (additive expansion) — generic runner.
// Everything above this block is pre-existing and untouched. New tools each
// have their own Python module under new_tools/<tool>.py speaking the
// PROGRESS:/RESULT: protocol (see new_tools/_common.py). This single generic
// handler routes jobs without per-tool IPC code.
// Allowed tool ids double as module file names (<id>.py).
// ============================================================================
const NEW_TOOL_MODULES = [
  "pdf_organizer", "pdf_compressor", "pdf_to_images", "images_to_pdf",
  "pdf_to_text", "pdf_info", "pdf_to_word", "pdf_to_excel",
  "pdf_image_extractor", "pdf_table_extractor", "pdf_editor", "pdf_crop",
  "pdf_snapshot", "pdf_flatten", "pdf_ocr", "scan_to_pdf",
  "pdf_blank_page_remover", "certificate_generator", "batch_pdf_renamer",
  "pdf_signer", "pdf_forms", "pdf_metadata_cleaner", "pdf_redaction",
  "pdf_repair", "pdf_measurement",
];

const activeNewToolJobs = new Map(); // jobId -> { process, cancelFile, cancelled }

function resolveNewToolModule(tool) {
  const devPath = path.join(__dirname, "..", "new_tools", `${tool}.py`);
  if (fs.existsSync(devPath)) return devPath;
  const resPath = path.join(process.resourcesPath || "", "new_tools", `${tool}.py`);
  if (resPath && fs.existsSync(resPath)) return resPath;
  return devPath;
}

ipcMain.handle("run-new-tool", async (event, { jobId, tool, operation, args, outputDir }) => {
  const id = String(jobId || `job_${Date.now()}`);
  const mod = String(tool || "");
  if (!NEW_TOOL_MODULES.includes(mod) || !/^[a-z_]+$/.test(mod)) {
    return { success: false, error: `Unknown tool: ${mod}` };
  }
  try {
    const { spawn } = require("child_process");
    const os = require("os");

    const outDir = outputDir || path.join(os.tmpdir(), `InfinityPDF_${mod}`);
    await fs.ensureDir(outDir);

    const modulePath = resolveNewToolModule(mod);
    if (!fs.existsSync(modulePath)) {
      return { success: false, error: `Backend module not found for tool: ${mod}` };
    }

    const cancelFile = path.join(os.tmpdir(), `newtool-cancel-${id}.flag`);
    try { if (fs.existsSync(cancelFile)) fs.removeSync(cancelFile); } catch (e) {}
    const job = { process: null, cancelFile, cancelled: false };
    activeNewToolJobs.set(id, job);

    const result = await new Promise((resolve) => {
      const proc = spawn("python", [modulePath, String(operation || ""), JSON.stringify(args || {}), outDir], {
        env: { ...process.env, NEWTOOL_CANCEL_FILE: cancelFile },
      });
      job.process = proc;

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        const text = data.toString();
        stdout += text;
        for (const m of text.matchAll(/PROGRESS:(\d+)/g)) {
          try {
            mainWindow.webContents.send("newtool-progress", { jobId: id, value: parseInt(m[1], 10) });
          } catch (e) {}
        }
      });
      proc.stderr.on("data", (data) => { stderr += data.toString(); });

      proc.on("error", (err) => {
        resolve({ success: false, error: `Failed to start Python backend (is Python installed?): ${err.message}` });
      });

      proc.on("close", (code) => {
        if (job.cancelled) {
          resolve({ success: false, cancelled: true });
          return;
        }
        try {
          const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
          const resultLines = lines.filter((l) => l.startsWith("RESULT:"));
          if (resultLines.length > 0) {
            resolve(JSON.parse(resultLines[resultLines.length - 1].slice("RESULT:".length)));
            return;
          }
        } catch (e) {
          resolve({ success: false, error: `Invalid backend response: ${e.message}` });
          return;
        }
        if (code === 0) {
          resolve({ success: false, error: "Backend produced no result" });
        } else {
          const tail = stderr.trim().split("\n").slice(-3).join(" ");
          resolve({ success: false, error: tail || `Backend failed with exit code ${code}` });
        }
      });
    });

    return result;
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    const job = activeNewToolJobs.get(id);
    activeNewToolJobs.delete(id);
    try {
      const cf = job && job.cancelFile;
      if (cf && fs.existsSync(cf)) fs.removeSync(cf);
    } catch (e) {}
  }
});

ipcMain.handle("cancel-new-tool", async (event, { jobId }) => {
  try {
    const job = activeNewToolJobs.get(String(jobId || ""));
    if (!job) return { success: true, note: "no active job" };
    job.cancelled = true;
    try { fs.ensureFileSync(job.cancelFile); } catch (e) {}
    const proc = job.process;
    if (proc && !proc.killed) {
      try {
        if (process.platform === "win32" && proc.pid) {
          const { execSync } = require("child_process");
          try {
            execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: "ignore" });
          } catch (e) {
            try { proc.kill("SIGKILL"); } catch (e2) {}
          }
        } else {
          proc.kill("SIGTERM");
        }
      } catch (e) {}
    }
    return { success: true, cancelled: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("export-files", async (event, { sourcePaths, targetDir }) => {
  try {
    for (const src of sourcePaths) {
      if (fs.existsSync(src)) {
        const dest = path.join(targetDir, path.basename(src));
        await fs.copy(src, dest);
      }
    }
    return { success: true };
  } catch (err) {
    console.error("Export error:", err);
    return { success: false, error: err.message };
  }
});
