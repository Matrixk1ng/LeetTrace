class Solution:
    def minSubArrayLen(self, target: int, nums: List[int]) -> int:
        total = 0
        best = float('inf')
        left = 0
        for right in range(len(nums)):
            total += nums[right]
            while total >= target:
                best = min(best, right - left + 1)
                total -= nums[left]
                left += 1
        return 0 if best == float('inf') else best
