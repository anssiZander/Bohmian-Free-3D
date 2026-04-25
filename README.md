# 3D Bohmian Particle in a Box

WebGL2 Bohmian mechanics simulation of a Gaussian wave packet in a closed 3D box.

The scalar wave field is advanced on a cubic grid that is flattened into a 2D texture atlas. The defaults favor cleaner reflection over speed: a higher grid resolution, a longer resolved de Broglie wavelength, and fourth-order finite-difference stencils for the wave Laplacian and particle guidance gradients. Bohmian particles are seeded from the same Gaussian density and guided by

`v = j / rho + (s hbar / (m rho)) * (grad rho x z_hat)`

so the fixed Pauli spin direction is `+z` / up. The wave uses hard-wall boundary sampling, so it reflects from the box walls, and particle positions are reflected back into the closed volume when a numerical step crosses a wall.

## Controls

- `grid size` changes the cubic simulation resolution.
- Drag the canvas to orbit around the box center; wheel zooms.
- `particle count` is capped lower than the 2D version for 3D performance.
- `density cloud` draws the 3D wave density as a projected point cloud.
- `Reset` restarts the wave, particles, and trails.
- `Pause` stops time stepping.
- `R` resets the simulation.
