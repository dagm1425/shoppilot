"""Search scaffolding placeholders for future subphases."""

# future: semantic-search - wire Chroma retrieval in subphase 4.2


class SearchProviderPlaceholder:
    """Placeholder semantic search interface reserved for vector retrieval."""

    def __init__(self) -> None:
        self.name = 'search-provider-placeholder'
