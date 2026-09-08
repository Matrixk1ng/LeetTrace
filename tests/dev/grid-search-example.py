from collections import deque


class Solution:
    def search(self, grid):
        q = deque([(0, 0)])
        seen = {(0, 0)}
        directions = [(-1, 0), (0, -1), (1, 0), (0, 1)]
        while q:
            for _ in range(len(q)):
                r, c = q.popleft()
                for dr, dc in directions:
                    nr, nc = r + dr, c + dc
                    if 0 <= nr < len(grid) and 0 <= nc < len(grid[0]) and (nr, nc) not in seen:
                        if grid[nr][nc] == 1:
                            grid[nr][nc] = 2
                            seen.add((nr, nc))
                            q.append((nr, nc))
        return grid
