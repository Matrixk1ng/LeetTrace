class Solution:
    def isValidBST(self, root: Optional[TreeNode]):
        def dfs(node, low=float('-inf'), high=float('inf')):
            if not node:
                return True
            if not low < node.val < high:
                return False
            return dfs(node.left, low, node.val) and dfs(node.right, node.val, high)
        return dfs(root)
