```yaml
---
title: Tetris Game Tutorial
description: A step-by-step guide to building a Tetris game using JavaScript and Canvas API.
tags: [Tetris, JavaScript, Canvas, game development, web games]
priority: PRIORITY
language: he
---
```

# מדריך לבניית משחק טטריס

## Introduction
Tetris is a classic puzzle game that serves as an excellent project for learning game development fundamentals. Building Tetris using JavaScript and the Canvas API teaches essential concepts like game loops, collision detection, and user input handling, which are critical for creating interactive web applications. This tutorial provides a comprehensive guide to implementing a fully functional Tetris game in the browser, making it an ideal project for beginners and intermediate developers alike.

## General Explanation
Tetris involves arranging falling tetrominoes (shapes composed of four squares) to form complete horizontal lines, which are then cleared to score points. The game requires:
- A **game loop** to update the game state and render graphics.
- A **Canvas API** for drawing tetrominoes and the game board.
- **Collision detection** to prevent tetrominoes from overlapping or moving out of bounds.
- **User input** to move and rotate pieces.
- **Scoring and game over** logic to track progress and end the game.

The Canvas API is used to render the game board and pieces dynamically, while JavaScript handles the logic for tetromino movement, rotation, and line clearing.

## Practical Usage Examples
Below is a simplified implementation of a Tetris game using JavaScript and Canvas. The example focuses on the core mechanics: rendering the board, moving a tetromino, and detecting collisions.

```javascript
// Initialize canvas and context
const canvas = document.getElementById('tetris');
const context = canvas.getContext('2d');
context.scale(20, 20); // Scale for larger blocks

// Game board (10x20 grid)
const board = Array(20).fill().map(() => Array(10).fill(0));

// Tetromino shapes (L-shape example)
const L_SHAPE = [
  [0, 0, 1],
  [1, 1, 1],
  [0, 0, 0]
];

// Current piece
let piece = {
  pos: { x: 4, y: 0 },
  matrix: L_SHAPE
};

// Game loop
function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

// Update game state
function update() {
  piece.pos.y++;
  if (collide(board, piece)) {
    piece.pos.y--;
    merge(board, piece);
    piece = { pos: { x: 4, y: 0 }, matrix: L_SHAPE }; // Reset piece
  }
}

// Draw board and piece
function draw() {
  context.fillStyle = '#000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  drawMatrix(board, { x: 0, y: 0 });
  drawMatrix(piece.matrix, piece.pos);
}

function drawMatrix(matrix, offset) {
  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value) {
        context.fillStyle = 'blue';
        context.fillRect(x + offset.x, y + offset.y, 1, 1);
      }
    });
  });
}

// Collision detection
function collide(board, piece) {
  const m = piece.matrix;
  const o = piece.pos;
  for (let y = 0; y < m.length; y++) {
    for (let x = 0; x < m[y].length; x++) {
      if (m[y][x] && (board[y + o.y] && board[y + o.y][x + o.x]) !== 0) {
        return true;
      }
    }
  }
  return false;
}

// Merge piece into board
function merge(board, piece) {
  piece.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value) {
        board[y + piece.pos.y][x + piece.pos.x] = value;
      }
    });
  });
}

// Handle user input
document.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') piece.pos.x--;
  if (event.key === 'ArrowRight') piece.pos.x++;
  if (event.key === 'ArrowDown') piece.pos.y++;
  if (collide(board, piece)) {
    piece.pos.x = event.key === 'ArrowLeft' ? piece.pos.x + 1 : piece.pos.x - 1;
    if (event.key === 'ArrowDown') piece.pos.y--;
  }
});

// Start game
gameLoop();
```

This code creates a basic Tetris game where an L-shaped tetromino falls, can be moved left or right, and merges with the board upon collision. The game loop continuously updates and renders the game state.

### Integration with Other Projects
Since this is a PRIORITY tutorial, let’s explore how to integrate this Tetris game into a larger project, such as a React application. You can encapsulate the game logic in a React component, using a `useRef` to access the canvas element and `useEffect` to initialize the game loop. Here’s an example of how to structure it:

```javascript
import React, { useRef, useEffect } from 'react';

function Tetris() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    context.scale(20, 20);
    // Initialize board, piece, and game loop as above
    // ...
    requestAnimationFrame(gameLoop);
  }, []);

  return <canvas ref={canvasRef} width={200} height={400} />;
}

export default Tetris;
```

This approach modularizes the game, allowing you to embed Tetris in a larger React-based game platform, with features like a leaderboard or menu system.

## Best Practices
- **Optimize the Game Loop**: Use `requestAnimationFrame` for smooth animations and to avoid unnecessary CPU usage.
- **Modularize Code**: Separate game logic (e.g., collision detection, piece movement) into functions for maintainability.
- **Handle Edge Cases**: Ensure tetrominoes cannot move outside the board or overlap illegally.
- **Responsive Design**: Adjust canvas size based on screen dimensions for mobile compatibility.
- **Performance**: Clear the canvas fully before each redraw to prevent artifacts.
- **Accessibility**: Add keyboard controls (e.g., arrow keys) and consider touch controls for mobile users.

This tutorial provides a foundation for building Tetris and can be extended with features like scoring, multiple tetromino shapes, and rotation logic.