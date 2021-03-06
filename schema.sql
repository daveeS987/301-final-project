DROP TABLE IF EXISTS parks_table;

CREATE TABLE parks_table(
    id SERIAL PRIMARY KEY,
    yelp_id VARCHAR(255),
    park_name VARCHAR(255),
    total_ratings VARCHAR(255),
    total_votes VARCHAR(255)
)