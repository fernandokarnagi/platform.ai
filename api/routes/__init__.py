from api.routes.clusters import router as clusters_router
from api.routes.downloads import router as downloads_router
from api.routes.engines import router as engines_router
from api.routes.library import router as library_router
from api.routes.nodes import router as nodes_router
from api.routes.settings import router as settings_router

__all__ = [
    "clusters_router",
    "downloads_router",
    "engines_router",
    "library_router",
    "nodes_router",
    "settings_router",
]
