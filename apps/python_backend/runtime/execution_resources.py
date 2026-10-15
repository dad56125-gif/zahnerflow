"""执行期本地资源与通用收尾边界。

资源只归属一次执行。公共执行流程只负责调用通用 close，不识别节点类型或
高级节点状态；具体哪些资源需要关闭由执行期适配自行登记。
"""

from __future__ import annotations

from typing import Any


class ExecutionResources:
    """一次执行内可关闭资源的登记与统一收尾。"""

    def __init__(self) -> None:
        self._closeables: list[Any] = []

    def register(self, closeable: Any) -> None:
        self._closeables.append(closeable)

    def unregister(self, closeable: Any) -> None:
        """已在执行期正常关闭的资源解除登记，公共收尾不再重复调用 close。"""

        self._closeables = [item for item in self._closeables if item is not closeable]

    def close(self) -> None:
        resources, self._closeables = self._closeables, []
        first_error: BaseException | None = None
        for resource in resources:
            try:
                resource.close()
            except BaseException as exc:  # noqa: BLE001 - 保留第一个真实收尾错误
                if first_error is None:
                    first_error = exc
        if first_error is not None:
            raise first_error
