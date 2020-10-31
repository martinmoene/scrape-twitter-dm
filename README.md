# scrape-twitter-dm

Create an e-book from direct messages (DMs) in a GDPR twitter archive.

Note: currently the content is limited to text and links, media are not yet handled.

## Dependencies

- [npm](https://www.npmjs.com/), typescript, node.
- [twitter-archive-reader](https://github.com/alkihis/twitter-archive-reader) (TypeScript).
- [Python](https://www.python.org/).

## Prerequisites

Download and install [npm](https://www.npmjs.com/).

Execute:

```Text
npm install -g typescript
npm install
tsc -p .
```

## Usage

Create an e-book:

```Text
call node typescript-js/scrape_twitter_dm.js \
    Name1:id1,Name2:id2 path/to/twitter-archive.zip epub/messages-name1-name2.txt

python script/scrape_twitter_txt_epub.py --verbose \
   --title="Twitter DM Name1 - Name2" \
   --author="Name1 and Name2" \
   --date="2019 - 2020" \
   --cover-image="media/cover.jpg" \
   --css="epub/template/style.css" \
   --css-participants=Name1:sender1,Name2:sender2 \
   --epub-template="epub/template/epub_template.html" \
   --dst-folder epub epub/messages-name1-name2.txt
```

## typescript/scrape_twitter_dm.ts

Write direct messages (DMs) from GDPR twitter archive as text file with a message per line

Usage of typescript-js/scrape_twitter_dm.js (compiled from `scrape_twitter_dm.ts`)

```Text
Usage: node scrape_twitter_dm [options] path/to/twitter-archive.zip [[p1-name:]p1-id,p2[,p3...]] [path/to/twitter-archive.txt]

Create structured text file with entries: {date}\t{sender-name}\t{message}

Options:
  -h, --help                   this help message
  -l, --list-conversations     list conversations in given archive
  -u, --list-user-information  list information on the owner of the given archive
```

Sample output

```Text
2020-07-07T01:34:56.789Z	Sender1-name	Message text.
2020-07-07T02:34:56.789Z	Sender2-name	Message text.
2020-07-07T03:34:56.789Z	Sender1-name	Message text.
...
```

## script/scrape_twitter_txt_epub.py

Create an e-book from a file `message.txt` created with `scrape_twitter_dm.js`. As an intermediate step, `scrape_twitter_txt_epub.py` creates a file with the messages in markdown format.

Usage of script/scrape_twitter_txt_epub.py

```Text
prompt>python script\scrape_twitter_txt_epub.py -h
usage: scrape_twitter_txt_epub.py [-h] [-v] [--dry-run] [--dst-folder path] [--title text] [--author text] [--date text]
                                  [--publisher text] [--rights text] [--cover-image path] [--front-matter path] [--css path]
                                  [--css-participants styles] [--epub-template tmpl] [--md-format format]
                                  path

Convert direct messages from text in source folder via markdown to epub in destination folder.

positional arguments:
  path                  file with messages in text format: date sender text

optional arguments:
  -h, --help            show this help message and exit
  -v, --verbose         report progress
  --dry-run             do not perform action, only report progress
  --dst-folder path     folder to write markdown and epub files to (required)
  --title text          title of e-book
  --author text         author of e-book
  --date text           date or year range of e-book
  --publisher text      publisher of e-book
  --rights text         rights of e-book
  --cover-image path    file with image for cover of e-book
  --front-matter path   file with front matter of epub
  --css path            file with css style sheet for epub
  --css-participants styles
                        names with css styles, like name1:sender1,name2:sender2
  --epub-template tmpl  pandoc epub template; see `pandoc -D epub`
  --md-format format    pandoc markdown format, e.g. 'markdown-tex_math_dollars'
```
