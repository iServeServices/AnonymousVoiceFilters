// /api/proxy.js
import axios from "axios";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { firebaseAudioUrl, voice_uuid, project_uuid } = req.body;

  if (!firebaseAudioUrl || !voice_uuid || !project_uuid) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const response = await axios.post(
      `https://api.resemble.ai/v1/projects/${project_uuid}/clips`,
      {
        voice_uuid: voice_uuid,
        title: "AnonymousVoiceClip",
        audio_source: firebaseAudioUrl,
        is_active: true
      },
      {
        headers: {
          Authorization: `Token GnGcq71mRhFH38gXn0WksAtt`,  // Replace with your actual token
          "Content-Type": "application/json"
        }
      }
    );

    res.status(200).json(response.data);

  } catch (err) {
    console.error("❌ Resemble Upload Error:", {
      status: err?.response?.status,
      message: err?.message,
      data: err?.response?.data,
    });

    return res.status(500).json({
      error: "Resemble upload failed",
      details: err?.response?.data || err.message
    });
  }
}
