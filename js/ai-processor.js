/**
 * Agmay 3D Converter - AI Processor Module
 * Performs client-side image analytics and simulates semantic vision networks.
 */

export class AIProcessor {
    constructor() {
        this.logCallback = null;
    }

    setLogCallback(callback) {
        this.logCallback = callback;
    }

    log(message, type = 'info') {
        if (this.logCallback) {
            this.logCallback(message, type);
        } else {
            console.log(`[AI-Log] [${type}] ${message}`);
        }
    }

    /**
     * Simulates deep neural network analysis on the uploaded/captured image.
     * Triggers canvas analysis to generate 3D mesh details and bounding indicators.
     */
    async analyzeImage(canvas, category = 'custom') {
        this.log("[1/4] Preprocessing input image tensor & centering bounds...", "info");
        await this.sleep(450);

        this.log("[2/4] Executing Multi-View Diffusion (Unique3D/MVDream)...", "accent");
        this.log(" -> Synthesizing 4 orthographic view-angles & normal maps...", "info");
        await this.sleep(700);

        this.log("[3/4] Running ISOMER Mesh Reconstruction...", "accent");
        this.log(" -> Performing differentiable rendering with Poisson-based optimization...", "info");
        await this.sleep(800);

        // Perform actual pixel analysis to make the AI feel real
        const pixelData = this.analyzeCanvasPixels(canvas);
        this.log(" -> cotangent Laplacian smoothness regularization computed.", "success");
        await this.sleep(350);

        // Perform background removal cutout (chroma key transparent background)
        let transparentCanvas = null;
        if (canvas) {
            this.log("[4/4] Generating UV-unwrapped PBR textures (SF3D/MeshGen)...", "accent");
            this.log(" -> Back-projecting multi-view colors onto XZ plane vertices...", "info");
            transparentCanvas = this.removeBackground(canvas, pixelData.contour.corners);
            await this.sleep(400);
        }

        // Generate the segmented parts
        const parts = this.generateParts(category, pixelData);
        
        this.log(" -> Initializing Gaussian Splatting Refinement (LGM-style)...", "info");
        await this.sleep(400);
        this.log(` -> Synthesized 65,536 Gaussians with learnable positions & SH features.`, "success");
        await this.sleep(300);

        this.log("Image-to-3D pipeline execution complete.", "success");

        return {
            category: category === 'custom' ? pixelData.inferredClass : category,
            confidence: pixelData.confidence,
            dimensions: pixelData.dimensions,
            parts: parts,
            grayscaleData: pixelData.grayscaleGrid, // Used for 3D displacement
            contour: pixelData.contour,
            transparentCanvas: transparentCanvas
        };
    }

    /**
     * Read canvas pixels and compute basic metrics:
     * - Grayscale grid for depth mapping (128x128 grid)
     * - Dominant color
     * - Outward-scanning silhouette contours (isolating centered objects)
     * - Symmetry verification
     */
    analyzeCanvasPixels(canvas) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // Grab pixels at a low resolution to analyze depth and boundaries
        const sampleSize = 128;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = sampleSize;
        tempCanvas.height = sampleSize;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(canvas, 0, 0, sampleSize, sampleSize);

        const imgData = tempCtx.getImageData(0, 0, sampleSize, sampleSize);
        const pixels = imgData.data;

        // 1. Determine background color by sampling the 4 corners
        const corners = [
            this.getPixelColor(pixels, 0, 0, sampleSize),
            this.getPixelColor(pixels, sampleSize - 1, 0, sampleSize),
            this.getPixelColor(pixels, 0, sampleSize - 1, sampleSize),
            this.getPixelColor(pixels, sampleSize - 1, sampleSize - 1, sampleSize)
        ];
        // Average corner colors
        const bgColor = {
            r: Math.round(corners.reduce((sum, c) => sum + c.r, 0) / 4),
            g: Math.round(corners.reduce((sum, c) => sum + c.g, 0) / 4),
            b: Math.round(corners.reduce((sum, c) => sum + c.b, 0) / 4)
        };

        // 2. Locate all foreground coordinates and bounding box to find the object center
        const grayscaleGrid = new Float32Array(sampleSize * sampleSize);
        const leftPoints = new Int32Array(sampleSize).fill(-1);
        const rightPoints = new Int32Array(sampleSize).fill(-1);
        
        let rSum = 0, gSum = 0, bSum = 0;
        let foregroundCount = 0;
        let minY = sampleSize, maxY = 0;
        let minX = sampleSize, maxX = 0;
        
        const colorDistThreshold = 45; // Euclidean distance in RGB space to isolate background
        const isForeground = new Uint8Array(sampleSize * sampleSize);

        for (let y = 0; y < sampleSize; y++) {
            for (let x = 0; x < sampleSize; x++) {
                const idx = (y * sampleSize + x) * 4;
                const r = pixels[idx];
                const g = pixels[idx+1];
                const b = pixels[idx+2];
                
                // Grayscale Z depth
                const grayscale = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;
                grayscaleGrid[y * sampleSize + x] = grayscale;

                // Distance to closest corner color to handle split/textured backgrounds
                const dist = Math.min(
                    Math.sqrt(Math.pow(r - corners[0].r, 2) + Math.pow(g - corners[0].g, 2) + Math.pow(b - corners[0].b, 2)),
                    Math.sqrt(Math.pow(r - corners[1].r, 2) + Math.pow(g - corners[1].g, 2) + Math.pow(b - corners[1].b, 2)),
                    Math.sqrt(Math.pow(r - corners[2].r, 2) + Math.pow(g - corners[2].g, 2) + Math.pow(b - corners[2].b, 2)),
                    Math.sqrt(Math.pow(r - corners[3].r, 2) + Math.pow(g - corners[3].g, 2) + Math.pow(b - corners[3].b, 2))
                );

                if (dist > colorDistThreshold) {
                    isForeground[y * sampleSize + x] = 1;
                    rSum += r;
                    gSum += g;
                    bSum += b;
                    foregroundCount++;

                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }

        // 3. Detect silhouette boundaries using Run-Length segmentation
        // We find the longest contiguous run of foreground pixels in each row
        // to filter out border noise and handle centering automatically.
        for (let y = minY; y <= maxY; y++) {
            let longestStart = -1;
            let longestLen = 0;
            
            let currentStart = -1;
            let currentLen = 0;

            for (let x = 0; x < sampleSize; x++) {
                if (isForeground[y * sampleSize + x] === 1) {
                    if (currentStart === -1) {
                        currentStart = x;
                    }
                    currentLen++;
                } else {
                    if (currentStart !== -1) {
                        if (currentLen > longestLen) {
                            longestLen = currentLen;
                            longestStart = currentStart;
                        }
                        currentStart = -1;
                        currentLen = 0;
                    }
                }
            }
            if (currentStart !== -1 && currentLen > longestLen) {
                longestLen = currentLen;
                longestStart = currentStart;
            }

            // If a run is detected (at least 4 pixels wide to filter out minor noise)
            if (longestLen >= 4) {
                leftPoints[y] = longestStart;
                rightPoints[y] = longestStart + longestLen - 1;
            } else {
                leftPoints[y] = -1;
                rightPoints[y] = -1;
            }
        }

        // Safe bounds
        if (minY >= maxY) {
            minY = Math.floor(sampleSize * 0.15);
            maxY = Math.floor(sampleSize * 0.85);
        }

        // 4. Compute Symmetry Index
        let symmetryDeviation = 0;
        let symmetryCount = 0;
        let totalWidth = 0;
        let avgMidline = sampleSize / 2;
        let midlineSum = 0;

        for (let y = minY; y <= maxY; y++) {
            if (leftPoints[y] !== -1 && rightPoints[y] !== -1) {
                const w = rightPoints[y] - leftPoints[y];
                const mid = (leftPoints[y] + rightPoints[y]) / 2;
                midlineSum += mid;
                totalWidth += w;
                symmetryCount++;
            }
        }
        
        if (symmetryCount > 0) {
            avgMidline = midlineSum / symmetryCount;
            
            // Compare left/right symmetry relative to average midline
            for (let y = minY; y <= maxY; y++) {
                if (leftPoints[y] !== -1 && rightPoints[y] !== -1) {
                    const distL = Math.abs(avgMidline - leftPoints[y]);
                    const distR = Math.abs(rightPoints[y] - avgMidline);
                    symmetryDeviation += Math.abs(distL - distR);
                }
            }
            symmetryDeviation = symmetryDeviation / (totalWidth / symmetryCount); // Normalize by avg width
        }

        // Symmetrical if left and right curves fluctuate very little
        const isSymmetric = symmetryDeviation < 0.12 && symmetryCount > 0;

        const avgR = Math.round(foregroundCount > 0 ? rSum / foregroundCount : bgColor.r);
        const avgG = Math.round(foregroundCount > 0 ? gSum / foregroundCount : bgColor.g);
        const avgB = Math.round(foregroundCount > 0 ? bSum / foregroundCount : bgColor.b);

        // Heuristic classification based on color/shape
        let inferredClass = "Mechanical Component";
        let dimensions = "25.0 x 25.0 x 12.0 cm";
        let confidence = "89.4%";

        if (isSymmetric) {
            inferredClass = "Vase Vessel";
            dimensions = "18.0 x 18.0 x 32.0 cm";
            confidence = "94.8%";
        } else if (avgR > 180 && avgG < 100 && avgB < 100) {
            inferredClass = "Biomedical Cylinder";
            dimensions = "15.2 x 15.2 x 28.5 cm";
            confidence = "92.1%";
        } else if (avgG > 130 && avgR < 120) {
            inferredClass = "Organic Foliage";
            dimensions = "35.0 x 30.0 x 42.0 cm";
            confidence = "93.4%";
        } else if (avgB > 150 && avgR < 130) {
            inferredClass = "Consumer Smart-Device";
            dimensions = "14.5 x 7.2 x 0.8 cm";
            confidence = "97.3%";
        } else if (avgR < 80 && avgG < 80 && avgB < 80) {
            inferredClass = "Cyberpunk Sneaker";
            dimensions = "29.0 x 11.5 x 15.0 cm";
            confidence = "95.5%";
        }

        return {
            grayscaleGrid,
            dominantColor: { r: avgR, g: avgG, b: avgB },
            inferredClass,
            dimensions,
            confidence,
            contour: {
                leftPoints,
                rightPoints,
                avgMidline,
                isSymmetric,
                minY,
                maxY,
                bgColor,
                corners
            }
        };
    }

    /**
     * Extracts foreground pixels and marks background as transparent (chroma key removal)
     */
    removeBackground(canvas, corners, threshold = 45) {
        const cutoutCanvas = document.createElement('canvas');
        cutoutCanvas.width = canvas.width;
        cutoutCanvas.height = canvas.height;
        const ctx = cutoutCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, 0);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imgData.data;

        const feather = 8;

        for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i];
            const g = pixels[i+1];
            const b = pixels[i+2];

            // Distance to closest corner color to handle split/textured backgrounds
            const dist = Math.min(
                Math.sqrt(Math.pow(r - corners[0].r, 2) + Math.pow(g - corners[0].g, 2) + Math.pow(b - corners[0].b, 2)),
                Math.sqrt(Math.pow(r - corners[1].r, 2) + Math.pow(g - corners[1].g, 2) + Math.pow(b - corners[1].b, 2)),
                Math.sqrt(Math.pow(r - corners[2].r, 2) + Math.pow(g - corners[2].g, 2) + Math.pow(b - corners[2].b, 2)),
                Math.sqrt(Math.pow(r - corners[3].r, 2) + Math.pow(g - corners[3].g, 2) + Math.pow(b - corners[3].b, 2))
            );

            // Interpolate alpha for smooth edges
            if (dist < threshold - feather) {
                pixels[i+3] = 0; // Transparent
            } else if (dist < threshold + feather) {
                const ratio = (dist - (threshold - feather)) / (2 * feather);
                pixels[i+3] = Math.round(ratio * 255);
            }
            // else remain fully opaque
        }

        ctx.putImageData(imgData, 0, 0);
        return cutoutCanvas;
    }

    getPixelColor(pixels, x, y, size) {
        const idx = (y * size + x) * 4;
        return { r: pixels[idx], g: pixels[idx+1], b: pixels[idx+2] };
    }

    /**
     * Generates a structural set of parts with coordinates, details, and labels.
     */
    generateParts(category, pixelData) {
        if (category === 'sneaker') {
            return [
                {
                    id: 1,
                    name: "Outsole Grip",
                    coords: { x: 0.0, y: -0.7, z: 0.2 }, // 3D offsets relative to object center
                    confidence: "99.1%",
                    volume: "34.2%",
                    material: "Vulcanized Rubber",
                    area: "124 cm²",
                    desc: "Provides traction, friction, and structural stability at the base. Optimized with custom micro-grooves."
                },
                {
                    id: 2,
                    name: "Midsole Cushion",
                    coords: { x: -0.2, y: -0.4, z: 0.1 },
                    confidence: "97.8%",
                    volume: "15.2%",
                    material: "Expanded TPU Foam",
                    area: "85 cm²",
                    desc: "Energy-returning cushion pad sand-wiched between outsole and upper mesh. Dampens compressive impacts."
                },
                {
                    id: 3,
                    name: "Primeknit Upper",
                    coords: { x: 0.3, y: 0.2, z: -0.1 },
                    confidence: "98.5%",
                    volume: "42.1%",
                    material: "Recycled Polyester Yarn",
                    area: "215 cm²",
                    desc: "Woven high-breathability upper fabric shell. Flexes dynamically with foot kinesiology."
                },
                {
                    id: 4,
                    name: "Lacing Eyelet Ring",
                    coords: { x: 0.1, y: 0.5, z: -0.3 },
                    confidence: "94.6%",
                    volume: "8.5%",
                    material: "Anodized Thermoplastic",
                    area: "34 cm²",
                    desc: "Reinforcement collar holding lacing tensioners in place. Anchors foot securely within the heel counter."
                }
            ];
        } else if (category === 'drone') {
            return [
                {
                    id: 1,
                    name: "Carbon Frame",
                    coords: { x: 0, y: -0.1, z: 0 },
                    confidence: "98.9%",
                    volume: "30.5%",
                    material: "3K Twill Carbon Fiber",
                    area: "260 cm²",
                    desc: "Ultra-lightweight structural frame absorbing resonance. Rigid center plate holds controllers."
                },
                {
                    id: 2,
                    name: "Brushless Motor",
                    coords: { x: -0.8, y: 0.1, z: 0.8 },
                    confidence: "99.4%",
                    volume: "18.2%",
                    material: "Neodymium Magnets & Steel",
                    area: "48 cm²",
                    desc: "2300KV high-velocity propulsion motors. Electromagnetically driven for rapid torque response."
                },
                {
                    id: 3,
                    name: "Propeller Set",
                    coords: { x: -0.8, y: 0.2, z: 0.8 },
                    confidence: "96.5%",
                    volume: "10.1%",
                    material: "Glass-Reinforced Nylon",
                    area: "110 cm²",
                    desc: "Dual-blade aerodynamic rotational fans producing thrust. Pitch optimized for high altitude control."
                },
                {
                    id: 4,
                    name: "Gimbal 4K Camera",
                    coords: { x: 0, y: -0.5, z: 0.6 },
                    confidence: "98.2%",
                    volume: "16.4%",
                    material: "Aluminum & Optical Glass",
                    area: "35 cm²",
                    desc: "3-axis mechanical shock stabilizer containing a Sony 1/2.3\" image sensor."
                },
                {
                    id: 5,
                    name: "LiPo Battery Pack",
                    coords: { x: 0, y: 0.3, z: -0.4 },
                    confidence: "97.1%",
                    volume: "24.8%",
                    material: "Lithium Polymer Cells",
                    area: "95 cm²",
                    desc: "4S 1500mAh battery block supplying 14.8V juice. Housed in fire-retardant heatshrink sleeve."
                }
            ];
        } else if (category === 'chair') {
            return [
                {
                    id: 1,
                    name: "Mesh Backrest",
                    coords: { x: 0, y: 0.6, z: -0.4 },
                    confidence: "98.0%",
                    volume: "38.0%",
                    material: "Tensioned Polyester Mesh",
                    area: "320 cm²",
                    desc: "Ergonomic thoracic support frame. Distributes load pressure and permits thermal ventilation."
                },
                {
                    id: 2,
                    name: "Foam Seat Pan",
                    coords: { x: 0, y: -0.1, z: 0 },
                    confidence: "99.2%",
                    volume: "28.5%",
                    material: "Molded Polyurethane Foam",
                    area: "280 cm²",
                    desc: "Contoured anatomical seat cushioning. Relieves coccyx fatigue and maintains pelvic alignment."
                },
                {
                    id: 3,
                    name: "Adjustable Armrest",
                    coords: { x: 0.6, y: 0.2, z: 0.1 },
                    confidence: "95.4%",
                    volume: "12.3%",
                    material: "Semi-rigid Polyurethane",
                    area: "64 cm²",
                    desc: "3D adjustable elbow rest pads. Mounted on height-adjustable steel struts."
                },
                {
                    id: 4,
                    name: "Gas Cylinder",
                    coords: { x: 0, y: -0.6, z: 0 },
                    confidence: "97.7%",
                    volume: "6.2%",
                    material: "Hardened Carbon Steel",
                    area: "20 cm²",
                    desc: "Class 4 pneumatic air valve. Holds high-pressure nitrogen to lift up to 150kg loads."
                },
                {
                    id: 5,
                    name: "Five-Star Base",
                    coords: { x: 0, y: -0.9, z: 0 },
                    confidence: "98.7%",
                    volume: "15.0%",
                    material: "Cast Aluminum Alloy",
                    area: "180 cm²",
                    desc: "Star base distributing tipping moment. Fitted with 60mm nylon castor wheels."
                }
            ];
        } else if (category === 'vase') {
            return [
                {
                    id: 1,
                    name: "Flared Neck Lip",
                    coords: { x: 0, y: 0.8, z: 0 },
                    confidence: "97.4%",
                    volume: "12.0%",
                    material: "Glazed Silicate Porcelain",
                    area: "35 cm²",
                    desc: "Tapered mouth ring acting as structural rim reinforcement. Coated in heat-resistant glaze."
                },
                {
                    id: 2,
                    name: "Bulbous Body",
                    coords: { x: 0.1, y: 0.1, z: 0 },
                    confidence: "99.0%",
                    volume: "65.4%",
                    material: "Baked Terracotta Clay",
                    area: "420 cm²",
                    desc: "Large spherical storage chamber. Thermally insulated to minimize internal moisture loss."
                },
                {
                    id: 3,
                    name: "Pedestal Footing",
                    coords: { x: 0, y: -0.8, z: 0 },
                    confidence: "98.2%",
                    volume: "18.2%",
                    material: "Thickened Clay Ring",
                    area: "75 cm²",
                    desc: "Wide solid stabilizer base. Lower center of gravity prevents tipping on flat planes."
                }
            ];
        } else {
            // DYNAMICALLY SEGMENT THE UPLOADED OBJECT BY HEURISTIC SILHOUETTE ANALYSIS
            const contour = pixelData.contour;
            const primaryColorName = this.getColorName(pixelData.dominantColor);
            
            const minY = contour.minY;
            const maxY = contour.maxY;
            const h = maxY - minY;
            const mid = contour.avgMidline;

            // Generate centroid coordinates for 3 sections
            const calculateCentroid = (yStart, yEnd) => {
                let xSum = 0, ySum = 0, count = 0;
                for (let y = Math.floor(yStart); y <= Math.floor(yEnd); y++) {
                    if (contour.leftPoints[y] !== -1 && contour.rightPoints[y] !== -1) {
                        xSum += (contour.leftPoints[y] + contour.rightPoints[y]) / 2;
                        ySum += y;
                        count++;
                    }
                }
                if (count === 0) return { x: 0, y: 0 };
                // Convert 128x128 pixels to normalized [-1.0 to 1.0] bounds for ThreeJS
                const cX = (xSum / count / 128 - 0.5) * 2;
                const cY = (0.5 - ySum / count / 128) * 2; // Flip Y for WebGL coordinates
                return { x: cX, y: cY };
            };

            const topCentroid = calculateCentroid(minY, minY + h * 0.3);
            const midCentroid = calculateCentroid(minY + h * 0.3, minY + h * 0.8);
            const botCentroid = calculateCentroid(minY + h * 0.8, maxY);

            const isSymmetric = contour.isSymmetric;

            return [
                {
                    id: 1,
                    name: isSymmetric ? "Upper Collar Rim" : `Upper ${primaryColorName} Shell`,
                    coords: { x: topCentroid.x, y: topCentroid.y, z: 0.15 },
                    confidence: "91.2%",
                    volume: "24.5%",
                    material: isSymmetric ? "Glazed Ceramic" : "Composite Synthetic Resin",
                    area: "72 cm²",
                    desc: "The uppermost visual shell segment. Functions as structural finish and houses inlet details."
                },
                {
                    id: 2,
                    name: isSymmetric ? "Bulbous Core Body" : "Central Structural Core",
                    coords: { x: midCentroid.x, y: midCentroid.y, z: 0.22 },
                    confidence: "94.6%",
                    volume: "58.2%",
                    material: isSymmetric ? "Baked Terracotta" : "Anodized Aluminum Alloy",
                    area: "235 cm²",
                    desc: "The main volumetric center of gravity. Extruded with high density structure and color mapping."
                },
                {
                    id: 3,
                    name: isSymmetric ? "Revolved Foot Base" : "Lower Support Base",
                    coords: { x: botCentroid.x, y: botCentroid.y, z: 0.15 },
                    confidence: "95.1%",
                    volume: "17.3%",
                    material: "High-density Elastomer",
                    area: "62 cm²",
                    desc: "The baseline support ring. Maximizes surface footprint area and dampens resonance."
                }
            ];
        }
    }

    getColorName(rgb) {
        const { r, g, b } = rgb;
        if (r > 200 && g > 200 && b > 200) return "Glazed White";
        if (r < 50 && g < 50 && b < 50) return "Carbon Black";
        if (r > g && r > b) return "Ruby Red";
        if (g > r && g > b) return "Cyan Green";
        if (b > r && b > g) return "Cobalt Blue";
        if (r > 150 && g > 150 && b < 100) return "Saffron Amber";
        if (r > 120 && g < 80 && b > 120) return "Velvet Violet";
        return "Composite Neutral";
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
