const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs-extra");

// Check if we're in development mode based on environment or app path
const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#000000",
    icon: path.join(__dirname, "favicon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "../main/preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const startUrl = isDev
    ? "http://localhost:3000"
    : `file://${path.join(__dirname, "index.html")}`;

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
  async (event, { sourcePath, recipients, watermark, outputDir, namingPattern }) => {
    try {
      const { spawn } = require("child_process");

      if (!fs.existsSync(outputDir)) {
        await fs.ensureDir(outputDir);
      }

      let targetRecipients = recipients;
      
      const hasCustomRecipient = Boolean(watermark?.customWatermarkText?.trim());

      if (!recipients || recipients.length === 0) {
        if (hasCustomRecipient) {
          targetRecipients = [];
        } else {
          targetRecipients = [""]; 
          watermark.enabled = false; 
        }
      } else {
        if (watermark.enabled === undefined) watermark.enabled = true;
      }

      const studentList = { students: targetRecipients.map(name => ({ name })) };
      
      return new Promise((resolve, reject) => {
        let executor, args;

        if (app.isPackaged) {
          executor = path.join(process.resourcesPath, "InfinityPDF-backend.exe");
          args = [
            "multi-pdf",
            sourcePath,
            outputDir,
            JSON.stringify(studentList),
            JSON.stringify(watermark)
          ];
        } else {
          executor = "python";
          args = [
            path.join(__dirname, "../backend.py"),
            "multi-pdf",
            sourcePath,
            outputDir,
            JSON.stringify(studentList),
            JSON.stringify(watermark)
          ];
        }

        if (namingPattern && namingPattern.trim()) {
          args.push(namingPattern.trim());
        }

        console.log("Spawning backend process for Multi PDF:", executor, args);
        const pythonProcess = spawn(executor, args);

        let stdout = "";
        let stderr = "";

        pythonProcess.stdout.on("data", (data) => {
          const text = data.toString();
          stdout += text;
          const progressMatch = text.match(/PROGRESS:(\d+)/);
          if (progressMatch) {
            mainWindow.webContents.send("process-progress", parseInt(progressMatch[1]));
          }
        });

        pythonProcess.stderr.on("data", (data) => {
          stderr += data.toString();
          console.error("Backend stderr:", data.toString());
        });

        pythonProcess.on("close", (code) => {
          if (code === 0) {
            try {
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
          console.error("Python spawn error:", err);
          reject(err);
        });
      });
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
);

// Core Logic: Apply PDF Security Permissions
ipcMain.handle(
  "apply-pdf-security",
  async (event, { fileBuffer, inputPath, fileName, permissions, outputDir }) => {
    try {
      const { spawn } = require("child_process");
      const os = require("os");

      if (!outputDir) outputDir = path.join(os.tmpdir(), "InfinityPDF_Security_Temp");
      if (!fs.existsSync(outputDir)) {
        await fs.ensureDir(outputDir);
      }

      const tempDir = os.tmpdir();
      let actualInputPath = inputPath;
      
      if (!actualInputPath && fileBuffer) {
        actualInputPath = path.join(tempDir, `infinity_input_${Date.now()}.pdf`);
        const uint8Array = new Uint8Array(fileBuffer);
        await fs.writeFile(actualInputPath, Buffer.from(uint8Array));
      }

      if (!actualInputPath) throw new Error("No input file provided");

      const baseName = fileName || path.basename(actualInputPath);
      const outputFileName = baseName.startsWith("SECURED_") ? baseName : `SECURED_${baseName}`;
      const outputPath = path.join(outputDir, outputFileName);

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

ipcMain.handle(
  "convert-universal",
  async (event, { inputPath, targetFormat, outputDir }) => {
    try {
      const { spawn } = require("child_process");
      const os = require("os");

      if (!outputDir) outputDir = path.join(os.tmpdir(), "InfinityPDF_Universal_Temp");
      if (!fs.existsSync(outputDir)) {
        await fs.ensureDir(outputDir);
      }

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
    return { success: false, error: err.message };
  }
});
