class Solution:
    def maxSum(self, nums: List[int], k: int) -> int:
        total = 0
        best = float('-inf')
        left = 0
        for right in range(len(nums)):
            total += nums[right]
            if right - left + 1 == k:
                best = max(best, total)
                total -= nums[left]
                left += 1
        return best
