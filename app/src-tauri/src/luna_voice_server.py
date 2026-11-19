"""Luna voice assistant: speech to text on the GPU (PyTorch, Intel XPU / CUDA / CPU).

One JSON line in ({"path": "...wav", "lang": "tr"}), one JSON line out ({"text": "..."}).
The first line out is {"ready": true} once the model is loaded. Model: LUNA_VOICE_MODEL or the Turkish
large-v3-turbo fine-tune below, from the local Hugging Face cache (offline).
"""
import json
import os
import sys

MODEL = os.environ.get("LUNA_VOICE_MODEL", "RsGoksel/RsGoksel_ITU_Mainframe")


def out(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


try:
    import numpy as np
    import soundfile as sf
    import torch
    from transformers import AutoProcessor, WhisperForConditionalGeneration

    if hasattr(torch, "xpu") and torch.xpu.is_available():
        device, dtype = "xpu", torch.float16
        torch.set_num_threads(1)
    elif torch.cuda.is_available():
        device, dtype = "cuda", torch.float16
    else:
        device, dtype = "cpu", torch.float32
    proc = AutoProcessor.from_pretrained(MODEL)
    model = WhisperForConditionalGeneration.from_pretrained(MODEL, dtype=dtype, attn_implementation="sdpa").to(device).eval()
    # one warm-up pass: the first run on the GPU builds its kernels
    with torch.no_grad():
        f = proc(np.zeros(16000, dtype=np.float32), sampling_rate=16000, return_tensors="pt").input_features.to(device, dtype)
        # the encoder runs on its own first: generate() straight from the features fails on Intel's driver
        model.generate(encoder_outputs=model.get_encoder()(f), language="tr", task="transcribe", max_new_tokens=8)
    out({"ready": True, "device": device})
except Exception as e:  # noqa: BLE001
    out({"error": f"load: {e}"})
    sys.exit(1)

for line in sys.stdin:
    try:
        req = json.loads(line)
        audio, sr = sf.read(req["path"], dtype="float32")
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        if sr != 16000:
            idx = np.linspace(0, len(audio) - 1, int(len(audio) * 16000 / sr))
            audio = np.interp(idx, np.arange(len(audio)), audio).astype(np.float32)
        audio = audio[: 30 * 16000]
        with torch.no_grad():
            f = proc(audio, sampling_rate=16000, return_tensors="pt").input_features.to(device, dtype)
            ids = model.generate(encoder_outputs=model.get_encoder()(f), language=req.get("lang") or "tr", task="transcribe", max_new_tokens=160)
        text = proc.batch_decode(ids, skip_special_tokens=True)[0].strip()
        out({"text": text})
    except Exception as e:  # noqa: BLE001
        out({"error": str(e)})
