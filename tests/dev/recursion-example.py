class Solution:
    def uniquePaths(self, m, n):
        def dfs(row, col):
            if row == m - 1 and col == n - 1:
                return 1
            if row >= m or col >= n:
                return 0
            return dfs(row + 1, col) + dfs(row, col + 1)
        return dfs(0, 0)
