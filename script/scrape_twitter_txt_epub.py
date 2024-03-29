#!/usr/bin/env python
#
# Copyright 2020 by Martin Moene
#
# Distributed under the Boost Software License, Version 1.0.
# (See accompanying file LICENSE.txt or copy at http://www.boost.org/LICENSE_1_0.txt)
#
# Scrape Twitter Archive for its DMs and create an epub e-book of it.
#
# Usage: script/scrape_twitter_txt_epub [-h] [-v] [options...] path/to/messages.txt
#
# Dependencies:
# - npm, typescript, node
# - twitter-archive-reader (TypeScript)
# - Python
#
# Process:
# 1. Read twitter archive, create epub/filename.txt with typescript/scrape_twitter_dm.ts
# 2. Convert messages to e-book via markdown using script/scrape_twitter_txt_epub.py
#
# Folders:
# - epub         : resulting text, markdown and e-book
# - .../template : default front_matter.md, style.css
# - media        : images
# - node_modules : JavaScript dependencies
# - script       : Python scripts
# - typescript   : this script
# - typescript-js: JavaScript generated from TypeScript

from __future__ import print_function

import os
import sys
import argparse

from datetime import datetime

last_time = None
last_year = None
last_mnth = None
last_date = None

def to_date(time):
    """Convert date from '2019-05-08T08:27:07.472Z' to 'Wed 08 May 2019 08:27'"""
    return datetime.fromisoformat(time[:-1]).strftime('%a %d %b %Y %H:%M')

def to_small_date(time):
    """Convert date from '2019-05-08T08:27:07.472Z' to 'Wed 08 May 2019 08:27'"""
    return "<span class=datesmall>{}</span>".format(to_date(time).replace(' ', '&nbsp;'))

def to_year_only(time):
    """Convert date from '2019-05-08T08:27:07.472Z' to '2019'"""
    return time[:4]

def to_month_only(time):
    """Convert date from '2019-05-08T08:27:07.472Z' to 'May'"""
    return to_date(time)[7:10]

def to_date_only(time):
    """Convert date from '2019-05-08T08:27:07.472Z' to 'Wed 08 May 2019'"""
    return to_date(time)[:15]

# Dictionary with CSS style for sender-name; see also create_css_participant_styles()
# {'sender-name':'sender1', ...}
css_name_dict = {}

def to_css_class(name):
    """Convert name"""
    return css_name_dict[name] if name in css_name_dict else 'sender1'

def to_name(name):
    """Convert name"""
    return '<span class={css_class}>{name}</span> <span class=namedash>&ndash;</span> '.format(css_class=to_css_class(name), name=name)

def to_heading(time):
    global last_time
    global last_year
    global last_mnth
    global last_date
    # year = ''
    mnth = ''
    date = ''
    last_time = time
    if last_year != to_year_only(time):
        last_year = to_year_only(time)
        # year = "## {year}\n\n".format(year=last_year)
    if last_mnth != to_month_only(time):
        last_mnth = to_month_only(time)
        mnth = "## {year} - {mnth}\n\n".format(year=last_year, mnth=last_mnth)
    if last_date != to_date_only(time):
        last_date = to_date_only(time)
        date = "### {date}".format(date=last_date)
        return "{mnth}{date}\n\n".format(mnth=mnth, date=date)
    else:
        return ''

import re
urlfinder = re.compile(r'(http([^\.\s]+\.[^\.\s]*)+[^\.\s]{2,})')

def to_link(text):
    """Convert urls to links"""
    return urlfinder.sub(r'[\1](\1)', text)

def to_text(text):
    """Convert text:"""
    return to_link( text.strip().replace('\\n', '\n').replace('[', '\\[') )

def to_outname(folder, path, ext):
    """Convert filename.org to folder/filename.ext"""
    return os.path.join(folder, os.path.splitext(os.path.split(path)[1])[0] + ext)

def convert_dm_text_epub(args, dm_text_path, dst_folder, verbose):
    """Create epub via markdown from messages collected in '{}' in folder '{}'."""
    if verbose:
        print('\n{}'.format(convert_dm_text_epub.__doc__.format(dm_text_path, dst_folder)))

    dm_markdown_path = to_outname(dst_folder, dm_text_path, '.md')
    dm_epub_path     = to_outname(dst_folder, dm_text_path, '.epub')

    create_css_participant_styles(args)
    convert_dm_text_markdown(args, dm_text_path, dm_markdown_path, verbose)
    convert_dm_markdown_epub(args, dm_markdown_path, dm_epub_path, verbose)

    if verbose:
        print('Done.')

def create_css_participant_styles(args):
    global css_name_dict
    if args.css_participants:
        for arg in args.css_participants.split(','):
            key, value = arg.split(':')
            css_name_dict[key] = value

def split_line(line):
    """Return elements time, name, text of line, handling format errors."""
    try:
        time, name, text = line.split('\t')
        return [time, name, text]
    except ValueError:
        sys.stderr.write("\nError reading line: '{}'\n".format(line) )
        return [last_time, 'Unknown', "**Error reading line**: '{}'".format(line)]

def convert_dm_text_markdown(args, dm_text_path, dm_markdown_path, verbose):
    """- Create markdown '{}' from messages collected in '{}'."""
    # print( args )
    if verbose:
        print(convert_dm_text_markdown.__doc__.format(dm_markdown_path, dm_text_path))
    # Pandoc reads and writes utf-8: "utf-8-sig"
    import codecs
    with codecs.open(dm_markdown_path, "w", "utf-8", errors='surrogateescape') as out:
        with codecs.open(dm_text_path, "r", "utf-8", errors='surrogateescape') as f:
            for line in f:
                time, name, text = split_line(line)
                out.write("{heading}<div class=entry>{name}{text}&ensp;{date}\n</div>\n\n".
                    format(heading=to_heading(time), name=to_name(name), text=to_text(text), date=to_small_date(time)) )

def convert_dm_markdown_epub(args, dm_text_path, dm_epub_path, verbose):
    """- Create epub '{}' from messages collected in '{}'."""
    if verbose:
        print(convert_dm_markdown_epub.__doc__.format(dm_epub_path, dm_text_path))

    pandoc_tpl = '{pandoc} -tmarkdown-smart --embed-resources --standalone --toc-depth={toc_depth} --split-level={chapter_level} --metadata=author:"{author}" --metadata=title:"{title}" {date} {publisher} {rights} {cover} --css="{css}" --from="{fmt_from}" --to="{fmt_to}" {template} -o "{output}" "{input}"'

    pandoc_cmd = pandoc_tpl.format(
        pandoc='pandoc',
        toc_depth=3,
        chapter_level=1,
        author=args.author,
        title=args.title,
        date='--metadata=date:"{}"'.format(args.date) if args.date else '',
        rights='--metadata=rights:"{}"'.format(args.rights) if args.rights else '',
        publisher='--metadata=publisher:"{}"'.format(args.publisher) if args.publisher else '',
        cover='--epub-cover-image="{}"'.format(args.cover_image) if args.cover_image else '',
        template='--template="{}"'.format(args.epub_template) if args.epub_template else '',
        fmt_from=args.md_format,
        fmt_to='epub',
        css=args.css,
        output=dm_epub_path,
        input=dm_text_path
    )
    if verbose:
        print('\nPandoc commandline:\n\n{}\n'.format(pandoc_cmd))

    import shlex, subprocess
    pandoc_cmd_args = shlex.split(pandoc_cmd)
    subprocess.Popen(pandoc_cmd_args).wait()

def main():
    """Convert direct messages from text in source folder via markdown to epub in destination folder."""

    parser = argparse.ArgumentParser(
        description="Convert direct messages from text in source folder via markdown to epub in destination folder.",
        epilog="""""",
        formatter_class=argparse.RawTextHelpFormatter)

    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='report progress')

    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='do not perform action, only report progress')

    parser.add_argument(
        '--dst-folder',
        metavar='path',
        type=str,
        help='folder to write markdown and epub files to (required)')

    parser.add_argument(
        '--title',
        metavar='text',
        type=str,
        help='title of e-book')

    parser.add_argument(
        '--author',
        metavar='text',
        type=str,
        help='author of e-book')

    parser.add_argument(
        '--date',
        metavar='text',
        type=str,
        help='date or year range of e-book')

    parser.add_argument(
        '--publisher',
        metavar='text',
        default=None,
        type=str,
        help='publisher of e-book')

    parser.add_argument(
        '--rights',
        metavar='text',
        default=None,
        type=str,
        help='rights of e-book')

    parser.add_argument(
        '--cover-image',
        metavar='path',
        type=str,
        help='file with image for cover of e-book')

    parser.add_argument(
        '--front-matter',
        metavar='path',
        type=str,
        help='file with front matter of epub')

    parser.add_argument(
        '--css',
        metavar='path',
        type=str,
        help='file with css style sheet for epub')

    parser.add_argument(
        '--css-participants',
        metavar='styles',
        type=str,
        help='names with css styles, like name1:sender1,name2:sender2')

    parser.add_argument(
        '--epub-template',
        metavar='tmpl',
        type=str,
        help='pandoc epub template; see `pandoc -D epub`')

    parser.add_argument(
        '--md-format',
        default='markdown',
        metavar='format',
        type=str,
        help='pandoc markdown format, e.g. \'markdown-tex_math_dollars\'')

    parser.add_argument(
        'filename',
        metavar='path',
        type=str,
        nargs=1,
        help='file with messages in text format: date sender text')

    args = parser.parse_args()

    #print(args)

    if not args.dst_folder:
        print("\nOption '--dst-folder=folder' is required. See '{} -h' for more help.\n".format(sys.argv[0]))
    else:
        convert_dm_text_epub(args, args.filename[0], args.dst_folder, args.verbose)

if __name__ == '__main__':
    main()

# end of file
