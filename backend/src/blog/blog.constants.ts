// Limits for the blog module, taken from docs/functional-requirements.csv

// BLG-01: post title length (matches the BlogPost schema)
export const POST_TITLE_MAX_LENGTH = 200;

// BLG-08: at most 5 tags per post, each at most 30 characters
export const POST_MAX_TAGS = 5;
export const TAG_MAX_LENGTH = 30;

// BLG-05: comments are non-empty and at most 500 characters
export const COMMENT_MAX_LENGTH = 500;

// BLG-10, GEN-08: at most 5 images per post
export const POST_MAX_IMAGES = 5;

// BLG-09: length of the body excerpt shown in lists and search results
export const EXCERPT_LENGTH = 200;

// BLG-09: longest search keyword accepted
export const SEARCH_MAX_LENGTH = 100;

// GEN-05: every list longer than 10 rows is paginated with page size 10
export const PAGE_SIZE = 10;
