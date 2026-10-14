// Fit a perspective sphere silhouette to a circle measured in CSS pixels.
// The tangent cone matters here: projecting only the sphere's equator is
// slightly smaller than its true outline, especially at the final distance.
export function sphereDistanceForDiameter(radius,viewportHeight,diameter,verticalFov) {
  const tangent=Math.tan(verticalFov*Math.PI/360);
  return radius*Math.hypot(1,viewportHeight/(diameter*tangent));
}
