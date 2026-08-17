from typing import Protocol


class Engine(Protocol):
    NAME: str
    BINARY_LABEL: str
    PID_FILE: str
    LOG_FILE: str

    def build_argv(self, node: dict, model_dir_expanded: str) -> list[str]:
        ...
