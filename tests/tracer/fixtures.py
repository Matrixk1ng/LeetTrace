"""Solution sources used by the tracer tests — one per problem archetype.

These are written the way LeetCode's editor hands them to us: a `Solution`
class with type annotations and no top-level call.
"""

TWO_SUM = '''class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        seen = {}
        for i, num in enumerate(nums):
            need = target - num
            if need in seen:
                return [seen[need], i]
            seen[num] = i
        return []
'''

REVERSE_LINKED_LIST = '''class Solution:
    def reverseList(self, head: Optional[ListNode]) -> Optional[ListNode]:
        prev = None
        curr = head
        while curr:
            nxt = curr.next
            curr.next = prev
            prev = curr
            curr = nxt
        return prev
'''

MERGE_TWO_LISTS = '''class Solution:
    def mergeTwoLists(self, list1: Optional[ListNode], list2: Optional[ListNode]) -> Optional[ListNode]:
        dummy = ListNode()
        tail = dummy
        while list1 and list2:
            if list1.val <= list2.val:
                tail.next = list1
                list1 = list1.next
            else:
                tail.next = list2
                list2 = list2.next
            tail = tail.next
        tail.next = list1 or list2
        return dummy.next
'''

HAS_CYCLE = '''class Solution:
    def hasCycle(self, head: Optional[ListNode]) -> bool:
        slow = head
        fast = head
        while fast and fast.next:
            slow = slow.next
            fast = fast.next.next
            if slow is fast:
                return True
        return False
'''

LEVEL_ORDER = '''class Solution:
    def levelOrder(self, root: Optional[TreeNode]) -> List[List[int]]:
        if not root:
            return []
        out = []
        queue = deque([root])
        while queue:
            level = []
            for _ in range(len(queue)):
                node = queue.popleft()
                level.append(node.val)
                if node.left:
                    queue.append(node.left)
                if node.right:
                    queue.append(node.right)
            out.append(level)
        return out
'''

INVERT_TREE = '''class Solution:
    def invertTree(self, root: Optional[TreeNode]) -> Optional[TreeNode]:
        if not root:
            return None
        root.left, root.right = self.invertTree(root.right), self.invertTree(root.left)
        return root
'''

MERGE_K_LISTS = '''class Solution:
    def mergeKLists(self, lists: List[Optional[ListNode]]) -> Optional[ListNode]:
        values = []
        for node in lists:
            while node:
                values.append(node.val)
                node = node.next
        values.sort()
        head = None
        for v in reversed(values):
            head = ListNode(v, head)
        return head
'''

BINARY_SEARCH = '''class Solution:
    def search(self, nums: List[int], target: int) -> int:
        lo = 0
        hi = len(nums) - 1
        while lo <= hi:
            mid = (lo + hi) // 2
            if nums[mid] == target:
                return mid
            if nums[mid] < target:
                lo = mid + 1
            else:
                hi = mid - 1
        return -1
'''

SUBSETS = '''class Solution:
    def subsets(self, nums: List[int]) -> List[List[int]]:
        out = []

        def backtrack(start, path):
            out.append(list(path))
            for i in range(start, len(nums)):
                path.append(nums[i])
                backtrack(i + 1, path)
                path.pop()

        backtrack(0, [])
        return out
'''

INFINITE_LOOP = '''class Solution:
    def spin(self, n: int) -> int:
        total = 0
        while True:
            total += 1
        return total
'''

INFINITE_LOOP_SWALLOWED = '''class Solution:
    def spin(self, n: int) -> int:
        total = 0
        while True:
            try:
                total += 1
            except Exception:
                pass
        return total
'''

RUNTIME_ERROR = '''class Solution:
    def boom(self, nums: List[int]) -> int:
        total = 0
        for x in nums:
            total += x
        return nums[99]
'''

PRINTS = '''class Solution:
    def shout(self, n: int) -> int:
        print("start")
        for i in range(n):
            print(i)
        return n
'''

BIG_INPUT = '''class Solution:
    def total(self, nums: List[int]) -> int:
        acc = 0
        for x in nums:
            acc += x
        return acc
'''
