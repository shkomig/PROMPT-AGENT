```yaml
---
title: Collision Detection in Games
description: A guide to implementing collision detection techniques for web-based games using JavaScript.
tags: [JavaScript, Canvas, collision detection, game development, React]
priority: medium
language: he
---
```

# זיהוי התנגשויות במשחקים

## Introduction
Collision detection is essential for realistic and interactive gameplay, allowing the game to respond when objects overlap, such as a ball hitting a paddle or a tetromino landing on the board. In web-based game development, collision detection is implemented using mathematical checks on object positions and shapes. This guide covers basic and advanced collision detection methods, with examples that enhance games like Tetris (**12-tutorial-tetris.md**) and Pong (**13-example-react-game.md**).

## General Explanation
Collision detection involves checking if two or more game objects occupy the same space. Common techniques include:
- **Bounding Box (AABB)**: Checking overlap between axis-aligned rectangles, simple and efficient for most 2D games.
- **Circle Collision**: Calculating distance between centers for circular objects.
- **Pixel-Perfect**: Checking pixel overlap for irregular shapes, more accurate but computationally intensive.
- **Integration with Game Loop**: Perform checks in the update phase of the game loop (from **02-game-loop.md**).
- **Response**: After detection, handle responses like bouncing, merging, or scoring.

This guide focuses on practical implementations for browser-based games using JavaScript and Canvas.

## Practical Usage Examples

### 1. Axis-Aligned Bounding Box (AABB) Collision
Check if two rectangles overlap, useful for paddles and ball in Pong.

```javascript
function checkAABBCollision(rect1, rect2) {
  return (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
  );
}

// Usage
const paddle = { x: 10, y: 150, width: 10, height: 100 };
const ball = { x: 15, y: 160, width: 10, height: 10 };
if (checkAABBCollision(paddle, ball)) {
  console.log('Collision detected!');
}
```

This snippet, reusable from **14-code-snippets.md**, detects overlap between a paddle and ball.

### 2. Circle Collision Detection
Check if two circles overlap by comparing distance to radii sum.

```javascript
function checkCircleCollision(circle1, circle2) {
  const dx = circle1.x - circle2.x;
  const dy = circle1.y - circle2.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance < circle1.radius + circle2.radius;
}

// Usage
const ball1 = { x: 400, y: 200, radius: 20 };
const ball2 = { x: 410, y: 210, radius: 15 };
if (checkCircleCollision(ball1, ball2)) {
  console.log('Circles collide!');
}
```

This is ideal for spherical objects or simplified character collisions.

### 3. Collision in Game Loop
Integrate AABB collision into a game loop for dynamic detection.

```javascript
function createGameLoop(update, render) {
  function loop() {
    update();
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

// Usage
const { canvas, context } = setupCanvas('gameCanvas', 800, 400); // From 03-canvas-basics.md
const ball = { x: 400, y: 200, width: 10, height: 10, dx: 2, dy: 1 };
const wall = { x: 700, y: 0, width: 10, height: 400 };

function update() {
  ball.x += ball.dx;
  ball.y += ball.dy;
  if (checkAABBCollision(ball, wall)) {
    ball.dx = -ball.dx; // Bounce back
  }
}

function render() {
  context.fillStyle = '#000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'white';
  context.fillRect(ball.x, ball.y, ball.width, ball.height);
  context.fillRect(wall.x, wall.y, wall.width, wall.height);
}

createGameLoop(update, render);
```

This animates a ball bouncing off a wall upon collision.

### 4. Pixel-Perfect Collision
For irregular shapes, check overlapping pixels using Canvas data.

```javascript
function checkPixelCollision(context, obj1, obj2) {
  // Assume objects are drawn on separate off-screen canvases
  const canvas1 = document.createElement('canvas');
  const ctx1 = canvas1.getContext('2d');
  canvas1.width = obj1.width;
  canvas1.height = obj1.height;
  // Draw obj1 on ctx1...

  const canvas2 = document.createElement('canvas');
  const ctx2 = canvas2.getContext('2d');
  canvas2.width = obj2.width;
  canvas2.height = obj2.height;
  // Draw obj2 on ctx2...

  // Get image data and check for overlapping non-transparent pixels
  // (Implementation simplified; full code would iterate over pixels)
  return true; // Placeholder for actual check
}

// Usage: More complex, typically used for sprites with transparency
```

Note: Pixel-perfect is resource-intensive; use sparingly.

### 5. React Integration with Collision
Integrate collision detection into a React component.

```javascript
import React, { useRef, useEffect } from 'react';

function GameCanvas({ width, height }) {
  const canvasRef = useRef(null);
  const ball = { x: 400, y: 200, width: 10, height: 10, dx: 2, dy: 1 };
  const wall = { x: 700, y: 0, width: 10, height: 400 };

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    canvas.width = width;
    canvas.height = height;

    function update() {
      ball.x += ball.dx;
      ball.y += ball.dy;
      if (checkAABBCollision(ball, wall)) {
        ball.dx = -ball.dx;
      }
    }

    function render() {
      context.fillStyle = '#000';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = 'white';
      context.fillRect(ball.x, ball.y, ball.width, ball.height);
      context.fillRect(wall.x, wall.y, wall.width, wall.height);
    }

    function loop() {
      update();
      render();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    return () => {};
  }, []);

  return (
    <div className="flex flex-col items-center">
      <canvas ref={canvasRef} width={width} height={height} className="border-2 border-white" />
    </div>
  );
}

// Usage
<GameCanvas width={800} height={400} />;
```

## Integration with Other Projects
This guide connects to other tutorials:
- **Tetris (12-tutorial-tetris.md)**: The AABB collision can detect when tetrominoes hit the board or other pieces, as in the collide function.
- **Pong (13-example-react-game.md)**: The circle collision or AABB can handle ball-paddle interactions for bouncing.
- **Code Snippets (14-code-snippets.md)**: The `checkAABBCollision` function matches the collision detection snippet in **14-code-snippets.md**.
- **Few-Shot Examples (15-fewshot-examples.json)**: Examples align with prompts like “Create a function to detect collision between two rectangles.”

For example, integrating with the game platform from **13-example-react-game.md**:

```javascript
import React, { useState } from 'react';
import GameCanvas from './GameCanvas'; // From this guide
import { tetrisLoop } from './Tetris'; // From 12-tutorial-tetris.md
import { pongLoop } from './Pong'; // From 13-example-react-game.md

function GamePlatform() {
  const [game, setGame] = useState('collision');
  const collisionDemoLoop = (context, canvas) => {
    const ball = { x: 400, y: 200, width: 10, height: 10, dx: 2, dy: 1 };
    const wall = { x: 700, y: 0, width: 10, height: 400 };
    return () => {
      ball.x += ball.dx;
      ball.y += ball.dy;
      if (checkAABBCollision(ball, wall)) {
        ball.dx = -ball.dx;
      }
      context.fillStyle = '#000';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = 'white';
      context.fillRect(ball.x, ball.y, ball.width, ball.height);
      context.fillRect(wall.x, wall.y, wall.width, wall.height);
      context.fillText('Collision Demo', 50, 30);
    };
  };

  return (
    <div className="flex flex-col items-center p-4 bg-gray-900 min-h-screen">
      <button onClick={() => setGame('collision')} className="px-4 py-2 bg-blue-500 text-white rounded mb-4">Collision Demo</button>
      <button onClick={() => setGame('tetris')} className="px-4 py-2 bg-green-500 text-white rounded mb-4">Tetris</button>
      <button onClick={() => setGame('pong')} className="px-4 py-2 bg-blue-500 text-white rounded mb-4">Pong</button>
      <GameCanvas width={800} height={400} gameLoop={game === 'collision' ? collisionDemoLoop : game === 'tetris' ? tetrisLoop : pongLoop} />
    </div>
  );
}
```

This integrates a collision detection demo with Tetris and Pong, showcasing modularity.

## Best Practices
- **Efficiency**: Use simple methods like AABB for most cases; reserve pixel-perfect for when accuracy is critical.
- **Early Checks**: Perform broad-phase checks (e.g., distance) before detailed collisions to optimize performance.
- **Response Handling**: Separate detection from response (e.g., bounce, destroy) for flexible code.
- **Debugging**: Visualize bounding boxes during development to verify collisions.
- **React Compatibility**: Update state in `useEffect` and ensure collision checks don't cause re-renders unnecessarily.
- **Reusability**: Write modular functions like `checkAABBCollision` for reuse, as in **14-code-snippets.md**.

This guide provides the tools to implement robust collision detection, improving gameplay in web-based games.