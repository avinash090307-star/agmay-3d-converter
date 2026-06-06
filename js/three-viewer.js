/**
 * Agmay 3D Converter - Three.js Viewer Module
 * Handles WebGL rendering, mesh generation, shader modes, and exports.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class ThreeViewer {
    constructor(containerId, overlayId = null) {
        this.container = document.getElementById(containerId);
        this.overlay = overlayId ? document.getElementById(overlayId) : null;
        
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        
        // Lighting
        this.ambientLight = null;
        this.dirLight = null;
        this.pointLight = null; // Glowing accent light
        this.lightAngle = 0;
        this.autoRotateLight = true;
        
        // Helpers
        this.gridHelper = null;
        
        // Models & Geometries
        this.currentModelGroup = null; // THREE.Group holding the parts
        this.modelCategory = '';
        this.viewMode = 'solid'; // solid, wireframe, points, depth, xray
        this.depthFactor = 1.5;
        this.resolution = 128;
        this.smoothing = 2;
        this.reconMethod = 'inflation'; // reconstruction method
        
        // Annotation management
        this.annotations = []; // { id, name, coords, element, point3D }
        
        // Materials cache
        this.presetMaterials = {};
        
        this.init();
    }

    init() {
        if (!this.container) return;
        const width = this.container.clientWidth || 400;
        const height = this.container.clientHeight || 400;

        // 1. Create Scene
        this.scene = new THREE.Scene();

        // 2. Create Camera
        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
        this.camera.position.set(4, 3, 5);

        // 3. Create WebGL Renderer with Transparent Background (alpha: true)
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // 4. Orbit Controls (with 360-degree auto-rotation)
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2 + 0.1; // Limit panning under floor
        this.controls.minDistance = 2;
        this.controls.maxDistance = 15;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 2.0; // Smooth 360-degree orbit

        // 5. Lighting Setup (tuned for transparent background clarity)
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(this.ambientLight);

        // Main shadows casting light
        this.dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        this.dirLight.position.set(5, 8, 5);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 1024;
        this.dirLight.shadow.mapSize.height = 1024;
        this.dirLight.shadow.bias = -0.001;
        this.scene.add(this.dirLight);

        // Soft warm accent point light (subtle, non-cyberpunk for clean rendering)
        this.pointLight = new THREE.PointLight(0x6c63ff, 0.5, 12);
        this.pointLight.position.set(-3, 2, -3);
        this.scene.add(this.pointLight);

        // 6. Floor grid helper (hidden by default)
        this.gridHelper = new THREE.GridHelper(12, 24, 0x6c63ff, 0x2a2a45);
        this.gridHelper.position.y = -1.05;
        this.gridHelper.material.opacity = 0.2;
        this.gridHelper.material.transparent = true;
        this.gridHelper.visible = false; // Hidden by default
        this.scene.add(this.gridHelper);

        // 7. Event Handlers
        window.addEventListener('resize', this.onWindowResize.bind(this));

        // Start animation loop
        this.animate();
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));
        
        // Smooth rotation/zoom damping
        this.controls.update();
        
        // Auto-rotate glowing light for beautiful dynamic shadows
        if (this.autoRotateLight && this.pointLight) {
            this.lightAngle += 0.005;
            this.pointLight.position.x = Math.cos(this.lightAngle) * 4;
            this.pointLight.position.z = Math.sin(this.lightAngle) * 4;
            
            // Pulse point light intensity slightly
            this.pointLight.intensity = 1.0 + Math.sin(this.lightAngle * 3) * 0.2;
        }

        // Project 3D tags onto HTML viewport coordinates (if annotations active)
        this.updateAnnotations();

        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    onWindowResize() {
        if (!this.container || !this.camera || !this.renderer) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        this.renderer.setSize(width, height);
    }

    resetCamera() {
        if (!this.camera || !this.controls) return;
        this.camera.position.set(4, 3, 5);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }

    toggleGrid(visible) {
        if (this.gridHelper) this.gridHelper.visible = visible;
    }

    toggleLightRotation(active) {
        this.autoRotateLight = active;
    }

    setAccentColor(colorHex) {
        if (this.pointLight) this.pointLight.color.setHex(colorHex);
        if (this.gridHelper) this.gridHelper.material.color.setHex(colorHex);
    }

    /**
     * Builds and displays the 3D model.
     * @param {Object} modelData Result from AI analysis containing category, parts, and grayscale height array.
     * @param {HTMLImageElement} imageEl Original source image for texturing.
     */
    async loadModel(modelData, imageEl) {
        // Clear previous meshes & annotations
        this.clearModel();
        
        this.modelCategory = modelData.category;
        this.currentModelGroup = new THREE.Group();
        this.scene.add(this.currentModelGroup);

        if (modelData.grayscaleData && imageEl) {
            // Build custom 3D mesh based on selected reconstruction method
            if (this.reconMethod === 'displacement') {
                this.buildDisplacementMesh(modelData, imageEl);
            } else if (this.reconMethod === 'extrusion') {
                this.buildExtrudedMesh(modelData, imageEl);
            } else if (this.reconMethod === 'lathe') {
                this.buildRevolvedMesh(modelData, imageEl);
            } else if (this.reconMethod === 'inflation') {
                this.buildInflatedMesh(modelData, imageEl);
            } else if (this.reconMethod === 'semantic') {
                this.buildSemanticAdapter(modelData, imageEl);
            }
        } else {
            // Build procedural demo model (Sneaker, Drone, Chair, Vase)
            this.buildProceduralModel(modelData);
        }

        // Apply shadows recursively to all children
        this.currentModelGroup.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // Set up the annotations overlay
        this.setupAnnotations(modelData.parts);

        // Adjust view mode
        this.updateViewMode(this.viewMode);

        // Soft camera zoom to focus on object
        this.resetCamera();
    }

    clearModel() {
        if (this.currentModelGroup) {
            this.scene.remove(this.currentModelGroup);
            this.currentModelGroup.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
            this.currentModelGroup = null;
        }
        
        // Remove HTML tags
        if (this.overlay) {
            this.overlay.innerHTML = '';
        }
        this.annotations = [];
    }

    /**
     * Generates a custom 3D displacement plane based on image pixel values.
     */
    buildDisplacementMesh(modelData, imageEl) {
        const res = this.resolution;
        const depth = this.depthFactor;
        
        // Create plane grid
        const geometry = new THREE.PlaneGeometry(3.5, 3.5, res - 1, res - 1);
        geometry.rotateX(-Math.PI / 2); // Align horizontally

        // Create texture from HTML Image
        const texture = new THREE.Texture(imageEl);
        texture.needsUpdate = true;
        texture.colorSpace = THREE.SRGBColorSpace;

        // Apply grayscale values as Z height offsets
        const vertices = geometry.attributes.position.array;
        const gData = modelData.grayscaleData; // 128x128 grid

        // Map resolution sizes if different
        for (let i = 0; i < res; i++) {
            for (let j = 0; j < res; j++) {
                // Map coordinates to 128x128 array
                const xMap = Math.floor((i / res) * 128);
                const yMap = Math.floor((j / res) * 128);
                const valIndex = yMap * 128 + xMap;
                
                // Get grayscale depth value (0.0 to 1.0)
                let heightVal = gData[valIndex] || 0;
                
                // Apply a simple gaussian blur smoothing if smoothing is enabled
                if (this.smoothing > 0) {
                    heightVal = this.getSmoothedVal(gData, xMap, yMap, 128, this.smoothing);
                }

                // Modify Y position (which is our Z height after rotateX)
                // Vertex components are [x, y, z] in layout
                const vertexIndex = (j * res + i) * 3;
                vertices[vertexIndex + 1] = heightVal * depth; // Elevate
            }
        }

        // Recalculate normal vectors for correct light shadows
        geometry.computeVertexNormals();

        // Create textured material
        const material = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.6,
            metalness: 0.1,
            side: THREE.DoubleSide,
            transparent: true,
            alphaTest: 0.25
        });

        const displacementMesh = new THREE.Mesh(geometry, material);
        displacementMesh.name = "displacement_relief";
        this.currentModelGroup.add(displacementMesh);
    }

    getSmoothedVal(grid, cx, cy, size, radius) {
        let sum = 0;
        let count = 0;
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                const px = cx + dx;
                const py = cy + dy;
                if (px >= 0 && px < size && py >= 0 && py < size) {
                    sum += grid[py * size + px];
                    count++;
                }
            }
        }
        return sum / count;
    }

    /**
     * Builds a beveled, extruded volumetric 3D mesh from silhouette contour points.
     */
    buildExtrudedMesh(modelData, imageEl) {
        const contour = modelData.contour;
        if (!contour) {
            this.buildDisplacementMesh(modelData, imageEl);
            return;
        }

        const shape = new THREE.Shape();
        const minY = contour.minY;
        const maxY = contour.maxY;

        let hasPoints = false;
        
        // Loop down left side of silhouette
        for (let y = maxY; y >= minY; y--) {
            const px = contour.leftPoints[y];
            if (px !== -1) {
                const x = (px / 128 - 0.5) * 3.5;
                const yVal = (0.5 - y / 128) * 3.5;
                if (!hasPoints) {
                    shape.moveTo(x, yVal);
                    hasPoints = true;
                } else {
                    shape.lineTo(x, yVal);
                }
            }
        }

        // Loop up right side of silhouette
        for (let y = minY; y <= maxY; y++) {
            const px = contour.rightPoints[y];
            if (px !== -1) {
                const x = (px / 128 - 0.5) * 3.5;
                const yVal = (0.5 - y / 128) * 3.5;
                shape.lineTo(x, yVal);
            }
        }

        if (!hasPoints) {
            this.buildDisplacementMesh(modelData, imageEl);
            return;
        }
        shape.closePath();

        // Extrude geometry settings
        const depth = this.depthFactor;
        const extrudeSettings = {
            depth: depth * 0.4,
            bevelEnabled: true,
            bevelThickness: 0.08,
            bevelSize: 0.04,
            bevelSegments: 4,
            steps: 1
        };

        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geometry.center(); // Center around local coordinate system

        // Create textures
        const texture = new THREE.Texture(imageEl);
        texture.needsUpdate = true;
        texture.colorSpace = THREE.SRGBColorSpace;

        // Front/Back caps display the source image, side walls display dark metal
        const capMat = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.5,
            metalness: 0.1,
            transparent: true,
            alphaTest: 0.25
        });
        const sideMat = new THREE.MeshStandardMaterial({
            color: 0x1f2937,
            roughness: 0.8,
            metalness: 0.7
        });

        const mesh = new THREE.Mesh(geometry, [capMat, sideMat]);
        mesh.name = "displacement_relief";
        this.currentModelGroup.add(mesh);
    }

    /**
     * Revolve the silhouette contour 360 degrees using LatheGeometry (symmetrical shapes).
     */
    buildRevolvedMesh(modelData, imageEl) {
        const contour = modelData.contour;
        if (!contour) {
            this.buildDisplacementMesh(modelData, imageEl);
            return;
        }

        const points = [];
        const minY = contour.minY;
        const maxY = contour.maxY;

        // Loop top-to-bottom, adding radius points (width/2)
        for (let y = minY; y <= maxY; y++) {
            if (contour.leftPoints[y] !== -1 && contour.rightPoints[y] !== -1) {
                const w = contour.rightPoints[y] - contour.leftPoints[y];
                const r = (w / 2) / 128 * 3.5; // Radius
                const yVal = (0.5 - y / 128) * 3.5;
                points.push(new THREE.Vector2(r, yVal));
            }
        }

        if (points.length === 0) {
            this.buildDisplacementMesh(modelData, imageEl);
            return;
        }

        const geometry = new THREE.LatheGeometry(points, 32);
        geometry.center();

        const texture = new THREE.Texture(imageEl);
        texture.needsUpdate = true;
        texture.colorSpace = THREE.SRGBColorSpace;

        const material = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.4,
            metalness: 0.15,
            side: THREE.DoubleSide,
            transparent: true,
            alphaTest: 0.25
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = "displacement_relief";
        this.currentModelGroup.add(mesh);
    }

    /**
     * Builds double-sided organic mesh puffed out like a balloon.
     */
    buildInflatedMesh(modelData, imageEl) {
        const contour = modelData.contour;
        if (!contour) {
            this.buildDisplacementMesh(modelData, imageEl);
            return;
        }

        const res = this.resolution;
        const depth = this.depthFactor;
        const gData = modelData.grayscaleData;
        const leftPoints = contour.leftPoints;
        const rightPoints = contour.rightPoints;

        // Build plane
        const geometry = new THREE.PlaneGeometry(3.5, 3.5, res - 1, res - 1);
        geometry.rotateX(-Math.PI / 2);

        const vertices = geometry.attributes.position.array;

        for (let i = 0; i < res; i++) {
            for (let j = 0; j < res; j++) {
                const xMap = Math.floor((i / res) * 128);
                const yMap = Math.floor((j / res) * 128);
                const valIndex = yMap * 128 + xMap;

                let heightVal = gData[valIndex] || 0;
                
                // Fetch edge boundary
                const L = leftPoints[yMap];
                const R = rightPoints[yMap];

                if (L !== -1 && R !== -1 && xMap >= L && xMap <= R) {
                    // Puff out based on distance to outline (sin curve)
                    const distToEdge = Math.sin(Math.PI * (xMap - L) / (R - L));
                    heightVal = heightVal * depth * distToEdge * 1.3;
                } else {
                    heightVal = -0.05; // Drop out background
                }

                if (this.smoothing > 0) {
                    // Apply extra smoothing to balloon sides
                    heightVal = this.getSmoothedVal(gData, xMap, yMap, 128, this.smoothing) * depth;
                    if (L !== -1 && R !== -1 && xMap >= L && xMap <= R) {
                        const distToEdge = Math.sin(Math.PI * (xMap - L) / (R - L));
                        heightVal = heightVal * distToEdge * 1.3;
                    } else {
                        heightVal = -0.05;
                    }
                }

                const vertexIndex = (j * res + i) * 3;
                vertices[vertexIndex + 1] = heightVal; // Y position is height
            }
        }

        geometry.computeVertexNormals();

        const texture = new THREE.Texture(imageEl);
        texture.needsUpdate = true;
        texture.colorSpace = THREE.SRGBColorSpace;

        const material = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.5,
            metalness: 0.1,
            side: THREE.DoubleSide,
            transparent: true,
            alphaTest: 0.25
        });

        // Double-sided back-to-back configuration to make it a solid volume
        const group = new THREE.Group();
        group.name = "displacement_relief";

        const frontMesh = new THREE.Mesh(geometry, material);
        frontMesh.castShadow = true;
        frontMesh.receiveShadow = true;
        group.add(frontMesh);

        // Mirror back mesh
        const backGeom = geometry.clone();
        const backVertices = backGeom.attributes.position.array;
        for (let i = 0; i < backVertices.length; i += 3) {
            // Flip height values (Y represents Z elevation in world space)
            backVertices[i + 1] = -backVertices[i + 1];
        }
        backGeom.computeVertexNormals();
        const backMesh = new THREE.Mesh(backGeom, material);
        backMesh.castShadow = true;
        backMesh.receiveShadow = true;
        group.add(backMesh);

        this.currentModelGroup.add(group);
    }

    /**
     * Color-matches high-quality preset assets directly to image pixel colors (semantic adapter).
     */
    buildSemanticAdapter(modelData, imageEl) {
        // Detect category or use sneaker as default
        const inferred = modelData.category.toLowerCase();
        let cat = 'sneaker';
        if (inferred.includes('vase')) cat = 'vase';
        else if (inferred.includes('drone')) cat = 'drone';
        else if (inferred.includes('chair')) cat = 'chair';

        // 1. Build the preset geometries
        this.buildProceduralModel({ category: cat });

        // 2. Sample average colors from region of the image
        const colors = this.extractRegionColors(imageEl);

        // 3. Map colors to sub-meshes dynamically
        this.currentModelGroup.traverse(child => {
            if (child.isMesh) {
                // Clone material to avoid sharing with preset cache
                child.material = child.material.clone();

                if (cat === 'sneaker') {
                    if (child.name === "Outsole Grip") {
                        child.material.color.setHex(colors.bottom);
                    } else if (child.name === "Midsole Cushion") {
                        child.material.color.setHex(colors.middle);
                    } else if (child.name === "Primeknit Upper") {
                        child.material.color.setHex(colors.top);
                    } else if (child.name === "Lacing Eyelet Ring") {
                        child.material.color.setHex(colors.middle ^ 0x334455); // contrasting color
                    }
                } else if (cat === 'drone') {
                    if (child.name === "Propeller Set") {
                        child.material.color.setHex(colors.top);
                    } else if (child.name === "Carbon Frame") {
                        child.material.color.setHex(colors.middle);
                    } else if (child.name === "Brushless Motor" || child.name === "LiPo Battery Pack") {
                        child.material.color.setHex(colors.bottom);
                    }
                } else if (cat === 'chair') {
                    if (child.name === "Mesh Backrest") {
                        child.material.color.setHex(colors.top);
                    } else if (child.name === "Foam Seat Pan" || child.name === "Adjustable Armrest") {
                        child.material.color.setHex(colors.middle);
                    } else if (child.name === "Five-Star Base" || child.name === "Gas Cylinder") {
                        child.material.color.setHex(colors.bottom);
                    }
                } else if (cat === 'vase') {
                    if (child.name === "Flared Neck Lip") {
                        child.material.color.setHex(colors.top);
                    } else if (child.name === "Bulbous Body") {
                        child.material.color.setHex(colors.middle);
                    } else if (child.name === "Pedestal Footing") {
                        child.material.color.setHex(colors.bottom);
                    }
                }
            }
        });
    }

    /**
     * Dynamic client-side color sampler.
     */
    extractRegionColors(imageEl) {
        const canvas = document.createElement('canvas');
        canvas.width = 10;
        canvas.height = 10;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imageEl, 0, 0, 10, 10);

        const imgData = ctx.getImageData(0, 0, 10, 10).data;

        const getAvgHex = (yStart, yEnd) => {
            let rSum = 0, gSum = 0, bSum = 0, count = 0;
            for (let y = yStart; y < yEnd; y++) {
                for (let x = 0; x < 10; x++) {
                    const idx = (y * 10 + x) * 4;
                    rSum += imgData[idx];
                    gSum += imgData[idx+1];
                    bSum += imgData[idx+2];
                    count++;
                }
            }
            const r = Math.round(rSum / count);
            const g = Math.round(gSum / count);
            const b = Math.round(bSum / count);
            return (r << 16) | (g << 8) | b;
        };

        return {
            top: getAvgHex(0, 3),    // rows 0-2
            middle: getAvgHex(3, 7), // rows 3-6
            bottom: getAvgHex(7, 10)  // rows 7-9
        };
    }

    /**
     * Builds detailed styled 3D models out of multiple grouped primitive segments.
     */
    buildProceduralModel(modelData) {
        const category = modelData.category;
        
        if (category === 'sneaker') {
            // Outsole
            const outsoleGeom = new THREE.BoxGeometry(2.4, 0.25, 0.9);
            const outsoleMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.8, metalness: 0.3 });
            const outsole = new THREE.Mesh(outsoleGeom, outsoleMat);
            outsole.position.set(0, -0.7, 0);
            outsole.name = "Outsole Grip";
            this.currentModelGroup.add(outsole);

            // Midsole
            const midsoleGeom = new THREE.BoxGeometry(2.3, 0.2, 0.85);
            const midsoleMat = new THREE.MeshStandardMaterial({ color: 0x6c63ff, roughness: 0.5, metalness: 0.1 });
            const midsole = new THREE.Mesh(midsoleGeom, midsoleMat);
            midsole.position.set(0, -0.5, 0);
            midsole.name = "Midsole Cushion";
            this.currentModelGroup.add(midsole);

            // Upper Mesh
            const upperGeom = new THREE.ConeGeometry(0.5, 1.8, 16);
            upperGeom.rotateZ(-Math.PI / 3.5); // Slant shape like shoe upper
            upperGeom.scale(1, 1, 0.7);
            const upperMat = new THREE.MeshStandardMaterial({ color: 0xff6584, roughness: 0.7, metalness: 0.2 });
            const upper = new THREE.Mesh(upperGeom, upperMat);
            upper.position.set(0.1, 0.1, 0);
            upper.name = "Primeknit Upper";
            this.currentModelGroup.add(upper);

            // Collar / Laces
            const lacingGeom = new THREE.CylinderGeometry(0.3, 0.35, 0.5, 12);
            lacingGeom.rotateZ(-Math.PI / 6);
            const lacingMat = new THREE.MeshStandardMaterial({ color: 0xff9800, roughness: 0.6, metalness: 0.4 });
            const lacing = new THREE.Mesh(lacingGeom, lacingMat);
            lacing.position.set(-0.2, 0.4, 0);
            lacing.name = "Lacing Eyelet Ring";
            this.currentModelGroup.add(lacing);

        } else if (category === 'drone') {
            // Carbon Frame base plate
            const plateGeom = new THREE.BoxGeometry(1.6, 0.06, 1.6);
            const carbonMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.9, metalness: 0.8 });
            const frame = new THREE.Mesh(plateGeom, carbonMat);
            frame.position.set(0, -0.1, 0);
            frame.name = "Carbon Frame";
            this.currentModelGroup.add(frame);

            // Four arms
            const armGeom = new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8);
            armGeom.rotateX(Math.PI / 2);
            armGeom.rotateY(Math.PI / 4);
            const arm1 = new THREE.Mesh(armGeom, carbonMat);
            arm1.name = "Carbon Frame";
            this.currentModelGroup.add(arm1);

            const armGeom2 = new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8);
            armGeom2.rotateX(Math.PI / 2);
            armGeom2.rotateY(-Math.PI / 4);
            const arm2 = new THREE.Mesh(armGeom2, carbonMat);
            arm2.name = "Carbon Frame";
            this.currentModelGroup.add(arm2);

            // Four Brushless Motors & Propellers at corners
            const motorGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.22, 12);
            const propGeom = new THREE.BoxGeometry(0.8, 0.015, 0.07);
            const motorMat = new THREE.MeshStandardMaterial({ color: 0xff6584, metalness: 0.9, roughness: 0.3 });
            const propMat = new THREE.MeshStandardMaterial({ color: 0x6c63ff, roughness: 0.7, metalness: 0.5 });

            const corners = [
                { x: 0.77, z: 0.77 }, { x: -0.77, z: 0.77 },
                { x: 0.77, z: -0.77 }, { x: -0.77, z: -0.77 }
            ];

            corners.forEach((c, idx) => {
                const motor = new THREE.Mesh(motorGeom, motorMat);
                motor.position.set(c.x, 0.1, c.z);
                motor.name = "Brushless Motor";
                this.currentModelGroup.add(motor);

                const prop = new THREE.Mesh(propGeom, propMat);
                prop.position.set(c.x, 0.22, c.z);
                prop.rotation.y = idx * (Math.PI / 4);
                prop.name = "Propeller Set";
                this.currentModelGroup.add(prop);
            });

            // Gimbal Camera
            const cameraGeom = new THREE.SphereGeometry(0.25, 16, 16);
            const camMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0f, metalness: 0.8, roughness: 0.2 });
            const cam = new THREE.Mesh(cameraGeom, camMat);
            cam.position.set(0, -0.4, 0.3);
            cam.name = "Gimbal 4K Camera";
            this.currentModelGroup.add(cam);

            // LiPo Battery
            const batteryGeom = new THREE.BoxGeometry(0.5, 0.32, 0.85);
            const batMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.6 });
            const battery = new THREE.Mesh(batteryGeom, batMat);
            battery.position.set(0, 0.22, -0.15);
            battery.name = "LiPo Battery Pack";
            this.currentModelGroup.add(battery);

        } else if (category === 'chair') {
            const plasticMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5 });
            const steelMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.9, roughness: 0.1 });
            const foamMat = new THREE.MeshStandardMaterial({ color: 0x6c63ff, roughness: 0.7 });

            // Foam Seat Pan
            const seatGeom = new THREE.BoxGeometry(1.5, 0.18, 1.4);
            const seat = new THREE.Mesh(seatGeom, foamMat);
            seat.position.set(0, -0.1, 0);
            seat.name = "Foam Seat Pan";
            this.currentModelGroup.add(seat);

            // Mesh Backrest
            const backGeom = new THREE.BoxGeometry(1.4, 1.4, 0.12);
            backGeom.rotateX(-Math.PI / 15);
            const backMat = new THREE.MeshStandardMaterial({ color: 0xff6584, roughness: 0.6 });
            const back = new THREE.Mesh(backGeom, backMat);
            back.position.set(0, 0.7, -0.6);
            back.name = "Mesh Backrest";
            this.currentModelGroup.add(back);

            // Armrests
            const armGeom = new THREE.BoxGeometry(0.15, 0.45, 0.8);
            const armL = new THREE.Mesh(armGeom, plasticMat);
            armL.position.set(0.8, 0.2, 0);
            armL.name = "Adjustable Armrest";
            this.currentModelGroup.add(armL);

            const armR = new THREE.Mesh(armGeom, plasticMat);
            armR.position.set(-0.8, 0.2, 0);
            armR.name = "Adjustable Armrest";
            this.currentModelGroup.add(armR);

            // Gas Cylinder shaft
            const cylinderGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.8, 12);
            const cylinder = new THREE.Mesh(cylinderGeom, steelMat);
            cylinder.position.set(0, -0.6, 0);
            cylinder.name = "Gas Cylinder";
            this.currentModelGroup.add(cylinder);

            // Five star Base spokes
            const baseSpokes = new THREE.Group();
            baseSpokes.name = "Five-Star Base";
            for (let i = 0; i < 5; i++) {
                const spokeGeom = new THREE.BoxGeometry(0.1, 0.08, 0.9);
                spokeGeom.translate(0, 0, 0.45); // offset pivot
                const spoke = new THREE.Mesh(spokeGeom, steelMat);
                spoke.rotation.y = i * (Math.PI * 2 / 5);
                baseSpokes.add(spoke);
            }
            baseSpokes.position.set(0, -1.0, 0);
            this.currentModelGroup.add(baseSpokes);

        } else if (category === 'vase') {
            const points = [];
            points.push(new THREE.Vector2(0.01, -0.8)); // center bottom
            points.push(new THREE.Vector2(0.45, -0.8)); // bottom outer
            points.push(new THREE.Vector2(0.75, -0.4)); // bulbous bottom
            points.push(new THREE.Vector2(0.85, 0.05)); // middle bulbous
            points.push(new THREE.Vector2(0.45, 0.45)); // thin neck
            points.push(new THREE.Vector2(0.28, 0.65)); // thin neck top
            points.push(new THREE.Vector2(0.48, 0.82)); // flared lip
            
            const latheGeom = new THREE.LatheGeometry(points, 32);
            
            // Create ceramic glaze material
            const vaseMat = new THREE.MeshStandardMaterial({
                color: 0x6c63ff,
                roughness: 0.1,
                metalness: 0.3,
                side: THREE.DoubleSide
            });

            const vaseMesh = new THREE.Mesh(latheGeom, vaseMat);
            vaseMesh.name = "Bulbous Body"; // Default name
            this.currentModelGroup.add(vaseMesh);

            // Add lip ring
            const lipGeom = new THREE.TorusGeometry(0.44, 0.04, 8, 32);
            lipGeom.rotateX(Math.PI / 2);
            lipGeom.translate(0, 0.81, 0);
            const lipMat = new THREE.MeshStandardMaterial({ color: 0xff6584, roughness: 0.1, metalness: 0.3 });
            const lipMesh = new THREE.Mesh(lipGeom, lipMat);
            lipMesh.name = "Flared Neck Lip";
            this.currentModelGroup.add(lipMesh);

            // Add footing ring
            const footGeom = new THREE.TorusGeometry(0.42, 0.045, 8, 32);
            footGeom.rotateX(Math.PI / 2);
            footGeom.translate(0, -0.8, 0);
            const footMesh = new THREE.Mesh(footGeom, vaseMat);
            footMesh.name = "Pedestal Footing";
            this.currentModelGroup.add(footMesh);
        }
    }

    /**
     * Initializes and overlays the HTML annotation indicators.
     */
    setupAnnotations(parts) {
        if (this.overlay) {
            this.overlay.innerHTML = '';
        }
        this.annotations = [];
        return; // Disabled projected HTML part labels completely to keep the 3D view clean
    }

    /**
     * Loops annotations, projecting their 3D coordinates into 2D screenspace.
     */
    updateAnnotations() {
        if (this.annotations.length === 0 || !this.currentModelGroup || !this.camera || !this.container) return;

        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        const tempV = new THREE.Vector3();

        this.annotations.forEach(anno => {
            let targetPos = new THREE.Vector3(anno.coords.x, anno.coords.y, anno.coords.z);
            
            if (this.modelCategory !== 'custom') {
                const subMesh = this.currentModelGroup.getObjectByName(anno.name);
                if (subMesh) {
                    subMesh.getWorldPosition(targetPos);
                    targetPos.x += anno.coords.x * 0.4;
                    targetPos.y += anno.coords.y * 0.4;
                    targetPos.z += anno.coords.z * 0.4;
                }
            } else {
                const relief = this.currentModelGroup.getObjectByName("displacement_relief");
                if (relief) {
                    relief.getWorldPosition(targetPos);
                    targetPos.x += anno.coords.x * 1.5;
                    targetPos.y += anno.coords.y * 1.5;
                    targetPos.z += anno.coords.z * 1.5;
                }
            }

            // Project 3D vector to screenspace
            tempV.copy(targetPos);
            tempV.project(this.camera);

            if (tempV.z > 1) {
                anno.element.style.opacity = '0';
                anno.element.style.pointerEvents = 'none';
            } else {
                const xPixels = (tempV.x * 0.5 + 0.5) * width;
                const yPixels = (tempV.y * -0.5 + 0.5) * height;

                anno.element.style.opacity = '1';
                anno.element.style.pointerEvents = 'auto';
                anno.element.style.left = `${xPixels - 8}px`;
                anno.element.style.top = `${yPixels - 8}px`;
            }
        });
    }

    /**
     * Toggles highlight materials or overlays for specific objects.
     */
    highlightPart(partName, active) {
        if (!this.currentModelGroup) return;

        this.currentModelGroup.traverse(child => {
            if (child.isMesh && child.name === partName) {
                if (active) {
                    // Cache original color if not already cached
                    if (!child.userData.originalColor) {
                        child.userData.originalColor = child.material.color.getHex();
                    }
                    // Glowing violet accent on select
                    child.material.color.setHex(0x6c63ff);
                    child.material.emissive = new THREE.Color(0x6c63ff);
                    child.material.emissiveIntensity = 0.5;
                } else {
                    if (child.userData.originalColor !== undefined) {
                        child.material.color.setHex(child.userData.originalColor);
                        child.material.emissive = new THREE.Color(0x000000);
                        child.material.emissiveIntensity = 0;
                    }
                }
            }
        });
    }

    selectPart(partId) {
        this.annotations.forEach(anno => {
            if (anno.id === partId) {
                anno.element.classList.add('active');
                this.highlightPart(anno.name, true);
                
                let targetPos = new THREE.Vector3(anno.coords.x, anno.coords.y, anno.coords.z);
                if (this.modelCategory !== 'custom') {
                    const subMesh = this.currentModelGroup.getObjectByName(anno.name);
                    if (subMesh) subMesh.getWorldPosition(targetPos);
                }
                
                this.controls.target.copy(targetPos);
                this.controls.update();
            } else {
                anno.element.classList.remove('active');
                this.highlightPart(anno.name, false);
            }
        });
    }

    /**
     * Changes rendering shaders.
     */
    updateViewMode(mode) {
        this.viewMode = mode;
        if (!this.currentModelGroup) return;

        this.currentModelGroup.traverse(child => {
            if (child.isMesh) {
                // Reset standard flags
                child.material.wireframe = false;
                child.material.transparent = false;
                child.material.opacity = 1.0;
                child.material.depthWrite = true;
                child.visible = true;

                if (mode === 'wireframe') {
                    child.material.wireframe = true;
                } else if (mode === 'points') {
                    child.material.wireframe = true;
                } else if (mode === 'depth') {
                    child.material.transparent = false;
                    child.material.emissive = new THREE.Color(0x6c63ff);
                    child.material.emissiveIntensity = Math.abs(child.position.y) * 0.8;
                } else if (mode === 'xray') {
                    child.material.transparent = true;
                    child.material.opacity = 0.25;
                    child.material.depthWrite = false;
                    child.material.wireframe = true;
                } else {
                    child.material.emissive = new THREE.Color(0x000000);
                    child.material.emissiveIntensity = 0;
                }
            }
        });

        // Special handling if using Points geometry representation on custom mesh
        const relief = this.currentModelGroup.getObjectByName("displacement_relief");
        if (relief && relief.isMesh) {
            const tempPoints = this.currentModelGroup.getObjectByName("displacement_relief_points");
            if (tempPoints) this.currentModelGroup.remove(tempPoints);

            if (mode === 'points') {
                relief.visible = false;
                
                const pointsGeom = relief.geometry;
                const pointsMat = new THREE.PointsMaterial({
                    size: 0.04,
                    color: 0x6c63ff,
                    transparent: true,
                    opacity: 0.8
                });
                
                if (relief.material.map) {
                    pointsMat.color.setHex(0xffffff);
                    pointsMat.map = relief.material.map;
                }

                const cloud = new THREE.Points(pointsGeom, pointsMat);
                cloud.name = "displacement_relief_points";
                this.currentModelGroup.add(cloud);
            } else {
                relief.visible = true;
            }
        }
    }

    setMeshParameters(depth, res, smooth) {
        this.depthFactor = depth;
        this.resolution = res;
        this.smoothing = smooth;
    }
}
