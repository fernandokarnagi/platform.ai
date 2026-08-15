from typing import Protocol


class Engine(Protocol):
    def build_argv(self, node: dict, model_filename: str, model_dir_expanded: str) -> list[str]:
        ...
