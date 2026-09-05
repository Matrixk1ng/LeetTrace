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

# --- M2: serialization families ------------------------------------------

BFS_DEQUE = '''class Solution:
    def bfs(self, n: int) -> List[int]:
        queue = deque([0])
        seen = set()
        order = []
        while queue:
            node = queue.popleft()
            if node in seen:
                continue
            seen.add(node)
            order.append(node)
            if node + 1 < n:
                queue.append(node + 1)
        return order
'''

HEAP_TOP_K = '''class Solution:
    def topK(self, nums: List[int], k: int) -> List[int]:
        heap = []
        for x in nums:
            heapq.heappush(heap, x)
            if len(heap) > k:
                heapq.heappop(heap)
        return sorted(heap)
'''

MONOTONIC_STACK = '''class Solution:
    def nextGreater(self, nums: List[int]) -> List[int]:
        out = [-1] * len(nums)
        stack = []
        for i, x in enumerate(nums):
            while stack and nums[stack[-1]] < x:
                out[stack.pop()] = x
            stack.append(i)
        return out
'''

COUNTER_ANAGRAM = '''class Solution:
    def isAnagram(self, s: str, t: str) -> bool:
        counts = Counter(s)
        groups = defaultdict(list)
        for ch in t:
            counts[ch] -= 1
            groups[ch].append(ch)
        return all(v == 0 for v in counts.values())
'''

MATRIX_SUM = '''class Solution:
    def gridSum(self, grid: List[List[int]]) -> int:
        total = 0
        for row in grid:
            for cell in row:
                total += cell
        return total
'''

RECURSION_SHADOWING = '''class Solution:
    def walk(self, n: int) -> int:
        def helper(depth):
            local = depth * 10
            if depth == 0:
                return local
            return helper(depth - 1) + local

        return helper(n)
'''
