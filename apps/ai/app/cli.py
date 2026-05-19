from __future__ import annotations

import argparse
import logging
from pathlib import Path

from app.config.settings import get_settings
from app.evals import run_eval_dataset
from app.observability import initialize_sentry
from app.search import rebuild_product_index

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(name)s %(message)s',
)
logger = logging.getLogger(__name__)


def main() -> None:
    default_eval_dataset = Path(__file__).resolve().parent.parent / 'evals' / 'phase-4-5-eval-dataset.json'

    parser = argparse.ArgumentParser(description='ShopPilot AI service maintenance commands')
    subparsers = parser.add_subparsers(dest='command', required=True)
    subparsers.add_parser('rebuild-index', help='Rebuild product embeddings and Chroma collection')
    eval_parser = subparsers.add_parser(
        'run-evals',
        help='Replay the Phase 4.5 eval dataset against /ai/chat and /ai/chat/stream',
    )
    eval_parser.add_argument(
        '--dataset',
        default=str(default_eval_dataset),
        help='Path to eval dataset JSON file.',
    )
    eval_parser.add_argument(
        '--base-url',
        default='http://localhost:3001',
        help='Gateway base URL for replaying eval requests.',
    )
    eval_parser.add_argument(
        '--timeout-seconds',
        type=float,
        default=15.0,
        help='Request timeout per eval step.',
    )
    args = parser.parse_args()

    settings = get_settings()
    initialize_sentry(settings)

    if args.command == 'rebuild-index':
        count = rebuild_product_index(settings)
        logger.info({'event': 'ai.cli_rebuild_index_success', 'indexed_count': count})
        return

    if args.command == 'run-evals':
        exit_code = run_eval_dataset(
            dataset_path=Path(args.dataset),
            base_url=args.base_url,
            timeout_seconds=args.timeout_seconds,
        )
        raise SystemExit(exit_code)


if __name__ == '__main__':
    main()
