class Solution:
    def climbStairs(self, n: int) -> int:
        memo = {}
        def dfs(n):
            if n <= 1:
                return 1
            if n in memo:
                return memo[n]
            memo[n] = dfs(n - 1) + dfs(n - 2)
            return memo[n]
        return dfs(n)
