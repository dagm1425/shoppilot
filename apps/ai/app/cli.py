from __future__ import annotations

import argparse
import logging

from app.config.settings import get_settings
from app.observability import initialize_sentry
from app.search import rebuild_product_index

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(name)s %(message)s',
)
logger = logging.getLogger(__name__)


def main() -> None:
    parser = argparse.ArgumentParser(description='ShopPilot AI service maintenance commands')
    subparsers = parser.add_subparsers(dest='command', required=True)
    subparsers.add_parser('rebuild-index', help='Rebuild product embeddings and Chroma collection')
    args = parser.parse_args()

    settings = get_settings()
    initialize_sentry(settings)

    if args.command == 'rebuild-index':
        count = rebuild_product_index(settings)
        logger.info({'event': 'ai.cli_rebuild_index_success', 'indexed_count': count})


if __name__ == '__main__':
    main()
