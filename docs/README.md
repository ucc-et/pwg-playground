# PWG Playground

Interactive demos of procedural world generation, from a single seed to a voxel world: seed, pure vs Perlin noise, octaves, biomes, chunks, caves, WFC and a final walkthrough. Every demo has adjustable parameters.

Plain ES modules with no build step. three.js loads from a CDN, so the 3D demos need an internet connection.

## Run locally

```bash
python3 -m http.server 8123 --directory docs
```

Then open http://localhost:8123.

## Publish

In the repository settings, under Pages, choose **Deploy from a branch**, then `main` and `/docs`.
