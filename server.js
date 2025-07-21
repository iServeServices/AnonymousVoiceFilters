const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs");
const cors = require("cors"); // <-- CORS enabled
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json()); // <-- allows JSON body parsing
const upload = multer({ dest: "uploads/" });

const outputDir = path.join(__dirname, "output");
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}
app.use("/output", express.static(outputDir));

app.post("/filter", upload.single("file"), async (req, res) => {
  const auth = req.headers.authorization;
  if (auth !== "anon-secret") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const effect = req.body.effect;
  const filters = {
    raw: null,
    deep_echo: "aecho=0.8:0.9:1000:0.3",
    whisper_of_peace: "highpass=f=300, aecho=0.9:0.88:60:0.4",
    robotic_echo: "atempo=0.85, asetrate=44100*0.9"
  };

  const filterCommand = filters[effect];
  if (!filterCommand && effect !== "raw") {
    return res.status(400).json({ error: "Unknown filter effect" });
  }

  let inputPath;

  if (req.file) {
    // Uploaded file (mobile)
    inputPath = path.join(__dirname, req.file.path);
  } else if (req.body.file_url) {
    // File from URL (FlutterFlow web)
    const tempName = `input_${uuidv4()}.mp3`;
    inputPath = path.join(__dirname, "uploads", tempName);

    try {
      const response = await axios.get(req.body.file_url, { responseType: "stream" });
      const writer = fs.createWriteStream(inputPath);
      response.data.pipe(writer);
      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });
    } catch (err) {
      return res.status(500).json({ error: "Failed to download file_url", details: err.message });
    }
  } else {
    return res.status(400).json({ error: "Missing file or file_url" });
  }

  const outputName = `filtered_${Date.now()}.mp3`;
  const outputPath = path.join(outputDir, outputName);
  const command = ffmpeg(inputPath);

  if (filterCommand) {
    command.audioFilters(filterCommand);
  }

  command
    .on("start", cmd => {
      console.log("🛠 FFmpeg command:", cmd);
    })
    .on("error", (err) => {
      console.error("❌ FFmpeg error:", err.message);
      res.status(500).json({ error: "Filter failed", details: err.message });
    })
    .on("end", () => {
      console.log("✅ Filter applied:", outputPath);
      res.json({ filtered_url: `/output/${outputName}` });
    })
    .save(outputPath);
});

app.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
});
