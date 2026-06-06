/**
 * Agmay 3D Converter - Exporter Module
 * Handles client-side export of Three.js geometries to OBJ and STL formats.
 */

import * as THREE from 'three';

export class MeshExporter {
    /**
     * Exports a THREE.Group to an OBJ file format.
     * @param {THREE.Group} group The group containing meshes to export.
     * @param {string} filename Output file name.
     */
    static exportToOBJ(group, filename = 'agmay_3d_model.obj') {
        if (!group) return;

        let objOutput = `# Agmay 3D Converter OBJ Exporter\n`;
        objOutput += `# Exported: ${new Date().toISOString()}\n\n`;

        let vertexCount = 0;
        
        group.traverse(child => {
            if (child.isMesh && child.visible) {
                // Force world matrix update to get correct vertex positions
                child.updateMatrixWorld(true);
                const geometry = child.geometry;
                
                // We handle BufferGeometry
                if (geometry.isBufferGeometry) {
                    const positionAttribute = geometry.attributes.position;
                    const index = geometry.index;
                    const matrixWorld = child.matrixWorld;

                    objOutput += `g ${child.name.replace(/\s+/g, '_')}\n`;

                    // 1. Write Vertices
                    const tempV = new THREE.Vector3();
                    for (let i = 0; i < positionAttribute.count; i++) {
                        tempV.fromBufferAttribute(positionAttribute, i);
                        // Apply mesh position/rotation/scale transformations
                        tempV.applyMatrix4(matrixWorld);
                        objOutput += `v ${tempV.x.toFixed(5)} ${tempV.y.toFixed(5)} ${tempV.z.toFixed(5)}\n`;
                    }

                    // 2. Write Texture coordinates (if mapped)
                    const uvAttribute = geometry.attributes.uv;
                    if (uvAttribute) {
                        for (let i = 0; i < uvAttribute.count; i++) {
                            objOutput += `vt ${uvAttribute.getX(i).toFixed(5)} ${uvAttribute.getY(i).toFixed(5)}\n`;
                        }
                    }

                    // 3. Write Faces
                    if (index) {
                        // Indexed Geometry
                        for (let i = 0; i < index.count; i += 3) {
                            const a = index.getX(i) + 1 + vertexCount;
                            const b = index.getX(i + 1) + 1 + vertexCount;
                            const c = index.getX(i + 2) + 1 + vertexCount;
                            
                            if (uvAttribute) {
                                objOutput += `f ${a}/${a} ${b}/${b} ${c}/${c}\n`;
                            } else {
                                objOutput += `f ${a} ${b} ${c}\n`;
                            }
                        }
                    } else {
                        // Non-indexed Geometry
                        for (let i = 0; i < positionAttribute.count; i += 3) {
                            const a = i + 1 + vertexCount;
                            const b = i + 2 + vertexCount;
                            const c = i + 3 + vertexCount;

                            if (uvAttribute) {
                                objOutput += `f ${a}/${a} ${b}/${b} ${c}/${c}\n`;
                            } else {
                                objOutput += `f ${a} ${b} ${c}\n`;
                            }
                        }
                    }

                    vertexCount += positionAttribute.count;
                    objOutput += `\n`;
                }
            }
        });

        // Trigger Download
        this.triggerDownload(objOutput, 'text/plain', filename);
    }

    /**
     * Exports a THREE.Group to an ASCII STL file format.
     * @param {THREE.Group} group The group containing meshes to export.
     * @param {string} filename Output file name.
     */
    static exportToSTL(group, filename = 'agmay_3d_model.stl') {
        if (!group) return;

        let stlOutput = `solid agmay_3d_model\n`;

        group.traverse(child => {
            if (child.isMesh && child.visible) {
                child.updateMatrixWorld(true);
                const geometry = child.geometry;

                if (geometry.isBufferGeometry) {
                    const positionAttribute = geometry.attributes.position;
                    const index = geometry.index;
                    const matrixWorld = child.matrixWorld;

                    const vA = new THREE.Vector3();
                    const vB = new THREE.Vector3();
                    const vC = new THREE.Vector3();
                    const cb = new THREE.Vector3();
                    const ab = new THREE.Vector3();
                    const normal = new THREE.Vector3();

                    const writeTriangle = (aIdx, bIdx, cIdx) => {
                        vA.fromBufferAttribute(positionAttribute, aIdx).applyMatrix4(matrixWorld);
                        vB.fromBufferAttribute(positionAttribute, bIdx).applyMatrix4(matrixWorld);
                        vC.fromBufferAttribute(positionAttribute, cIdx).applyMatrix4(matrixWorld);

                        // Compute Face Normal
                        cb.subVectors(vC, vB);
                        ab.subVectors(vA, vB);
                        cb.cross(ab).normalize();
                        normal.copy(cb);

                        stlOutput += `  facet normal ${normal.x.toFixed(5)} ${normal.y.toFixed(5)} ${normal.z.toFixed(5)}\n`;
                        stlOutput += `    outer loop\n`;
                        stlOutput += `      vertex ${vA.x.toFixed(5)} ${vA.y.toFixed(5)} ${vA.z.toFixed(5)}\n`;
                        stlOutput += `      vertex ${vB.x.toFixed(5)} ${vB.y.toFixed(5)} ${vB.z.toFixed(5)}\n`;
                        stlOutput += `      vertex ${vC.x.toFixed(5)} ${vC.y.toFixed(5)} ${vC.z.toFixed(5)}\n`;
                        stlOutput += `    endloop\n`;
                        stlOutput += `  endfacet\n`;
                    };

                    if (index) {
                        for (let i = 0; i < index.count; i += 3) {
                            writeTriangle(index.getX(i), index.getX(i + 1), index.getX(i + 2));
                        }
                    } else {
                        for (let i = 0; i < positionAttribute.count; i += 3) {
                            writeTriangle(i, i + 1, i + 2);
                        }
                    }
                }
            }
        });

        stlOutput += `endsolid agmay_3d_model\n`;

        // Trigger Download
        this.triggerDownload(stlOutput, 'text/plain', filename);
    }

    static triggerDownload(content, mimeType, filename) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        
        document.body.appendChild(link);
        link.click();
        
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}
