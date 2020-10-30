
// Copyright 2020 by Martin Moene
//
// Distributed under the Boost Software License, Version 1.0.
// (See accompanying file LICENSE.txt or copy at http://www.boost.org/LICENSE_1_0.txt)
//
// Scrape Twitter Archive for its DMs and create an epub e-book of it.
//
// Usage: script/xxxx [-h] [-v] [options...] [p1-name:]p1-id,p2-name:p2-id[,p3...] twitter-archive [output_path]
//
// Output format: {date}\t{sender-name}\t{message}
//
// Dependencies:
// - npm, typescript, node (https://www.npmjs.com/)
// - twitter-archive-reader (TypeScript, https://github.com/alkihis/twitter-archive-reader)
//
// Process:
// 1. Read twitter archive, create epub/xxx.txt with typescript/scrape_twitter_dm.ts
// 2. Convert messages to e-book via markdown using script/scrape_twitter_txt_epub.py

// Folders:
// - epub         : resulting text, markdown and e-book
// - .../template : default front_matter.md, style.css
// - media        : images
// - node_modules : JavaScript dependencies
// - script       : Python scripts
// - typescript   : this script
// - typescript-js: JavaScript generated from TypeScript

// ----------------
// Structure of a conversation:
//
// Conversation {
//   _index: {
//     '1265899312388599812': {
//       recipientId: '239822901',
//       reactions: [],
//       urls: [],
//       text: 'Text',
//       mediaUrls: [],
//       senderId: '15889300',
//       id: '1265899312388599812',
//       createdAt: '2020-05-28T06:54:50.051Z',
//       createdAtDate: 2020-05-28T06:54:50.051Z,
//       previous: null,
//       next: [Object]
//     },
//     '1265899616760889348': { ... }
//   }
// ----------------

// export { scrape_twitter_dm }

import { stdout, stderr } from "process";
import { TwitterArchive, DMArchive, Conversation } from "twitter-archive-reader";

// Store both name,id and id,name:

interface Participants { [key : string] : string /*{ val : string }*/ }

// Convenience functions:

// The number of people:

function count( participants : Participants ) : number
{
	return Object.keys(participants).length / 2
}

// True if string contains number:

function is_numeric( text : string ) : boolean
{
	return !!text.match(/[0-9]+/)
}

// Return name if available, id otherwise:

function to_name( name_or_id : string, participants : Participants ) : string
{
	if ( is_numeric( name_or_id ) )
		return participants[name_or_id] == undefined ? name_or_id : participants[name_or_id]

	return name_or_id
}

// Return id if available, name otherwise

function to_id( name_or_id : string, participants : Participants ) : string
{
	if ( is_numeric( name_or_id ) )
		return name_or_id

	return participants[name_or_id] == undefined ? name_or_id : participants[name_or_id]
}

// Print participant names and ids:

function print_participants( out : Writable, participants : Participants )
{
	out.write("\nParticipants: ")
	for ( const key in participants )
	{
		if ( !is_numeric( key ) )
			stderr.write(`\n- ${key} (${participants[key]})`)
	}
	out.write("\n\n")
}

// Bailout if not a GDPR archive (required for DMs):

function is_gdpr( archive : TwitterArchive ) : boolean
{
	return archive.is_gdpr === true
}

// Inform if GDPR archive type:

function print_gdpr( out : Writable, archive : TwitterArchive )
{
	out.write( is_gdpr( archive )
		? "Archive is a GDPR archive (required for access to DMs)\n"
		: "Archive is not a GDPR archive (required for access to DMs)\n"
	)
}

// Show some information on archive owner:

async function print_user_info( out : Writable, archive : TwitterArchive )
{
	const user = archive.user

	out.write(`
Screen name: ${user.screen_name}
Name: ${user.name}
Bio: ${user.bio}
Registered location: ${user.location}
User ID: ${user.id}
You are${user.verified ? "" : " not"} verified
Creation date: ${archive.user.created_at}
Creation IP: ${archive.user.account_creation_ip}
`);

	// List the used screen names (@) over time

	const history = [
		...archive.user.screen_name_history.map(s => s.changedFrom),
		archive.user.screen_name
	];

	out.write(`You used the following names: @${history.join(', @')}\n`);

	// Get the user profile picture and banner as binary data

	const [profile, header] = await Promise.all([
		archive.medias.getProfilePictureOf(archive.user),
		archive.medias.getProfileBannerOf(archive.user)
	]);

	// return false // Ok
}

// Print conversations:

function print_conversations( out : Writable, archive : TwitterArchive )
{
	const conversations = archive.messages.all

	out.write(`\nThere are #${conversations.length} conversations here.\n\n`);

	for ( const text of conversations.map( c =>
		`Conversation ${c.id} with users ${[...c.participants].join(', ')}, containing ${c.length} messages.\n`) )
	{
		out.write(text)
	}
}

// Open archive by path:

function open_archive( out : Writable, ziparchive_path : string ) : TwitterArchive
{
	const archive = new TwitterArchive( ziparchive_path );

	// Initialization can be long (unzipping, tweets & DMs reading...)
	// So archive supports events, you can listen for initialization steps
	// See all available listeners in Events section.

	archive.events.on('zipready', () => {
		out.write("ZIP is unzipped, ");
	});

	archive.events.on('tweetsread', () => {
		out.write("Tweet files has been read, ");
	});

	archive.events.on('ready', () => {
		out.write("Archive has been read.\n");
	});

	out.write("Reading twitter archive '" + ziparchive_path + "'\n")

	return archive
}

// Escape newline and tab, \udddd:

function to_line( text : string ) : string
{
	return text.
		replace(/\n/gi, "\\n").
		replace(/\\t/gi, "\\\\t").
		replace(/\\u/gi, "\\\\u")
}

// true if given id participates in the conversation:

function has_id( id : string, conversation : Conversation ) : boolean
{
	return conversation.participants.has( id )
}

// true if given participants participate in the conversation:

function has_participants( conversation : Conversation, participants : Participants ) : boolean
{
	for ( const key in participants )
	{
		if ( is_numeric( key ) && !has_id( key, conversation ) )
			return false;
	}
	return true;
}

// Provide direct messages (2 participants) or all messages (more than 2 participants):

function to_messages( messages : DMArchive, participants : Participants ) : Conversation[]
{
	return count(participants) <= 2 ? messages.directs : messages.all
}

// Select requested DMs and write as: {date}\t{sender-name}\t{message}:

function print_messages( out : Writable, participants : Participants, archive : TwitterArchive )
{
	for ( const conversation of to_messages( archive.messages, participants ) )
	{
		if ( has_participants( conversation, participants ) )
		{
			for ( const message of conversation )
			{
				out.write(`${message.createdAt}\t${to_name(message.senderId, participants)}\t${to_line(message.text)}\n`)
			}
		}
	}
}

// ----------------------------------------------
// main program:

import { exit /*, stdout*/ } from "process";
import { Writable } from "stream";
import { createWriteStream } from "fs";

// Print usage and participants specified:

function print_usage( out : Writable, code : number ) : number
{
	out.write(`
Usage: node scrape_twitter_dm [options] path/to/twitter-archive.zip [[p1-name:]p1-id,p2[,p3...]] [path/to/twitter-archive.txt]

Create structured text file with entries: {date}\\t{sender-name}\\t{message}

Options:
  -h, --help                   this help message
  -l, --list-conversations     list conversations in given archive
  -u, --list-user-information  list information on the owner of the given archive
`	)
	return code
}

// Print available conversations in given archive:

async function list_conversations( out : Writable, ziparchive_path : string )
{
	const archive = open_archive( stderr, ziparchive_path );

	await archive.ready();

	print_conversations( out, archive )
}

// Print information on archive owner:

async function list_user_information( out : Writable, ziparchive_path : string )
{
	const archive = open_archive( stderr, ziparchive_path );

	await archive.ready();

	print_user_info( out, archive )
}

//
// Print conversation in given archive between given participants:
//
// Format: {date}\t{sender-name}\t{message}
//

async function scrape_twitter_dm( participants : Participants, ziparchive_path : string, output_path : string )
{
	if ( output_path.length )
		stderr.write(`\nOutput: '${output_path}'.\n`)

	if ( count( participants ) < 2 )
	{
		stderr.write(`\nError: two or more participants expected, one given: '${participants[0]}'\n\n`)
		return
	}

	print_participants( stderr, participants )

	const archive = open_archive( stderr, ziparchive_path );

	await archive.ready();

	print_gdpr( stderr, archive )

	if ( !is_gdpr( archive ) )
	{
		stderr.write("Bailing out as archive is not a GDPR archive (required for access to DMs)\n")
		return
	}

	const out = output_path.length > 0 ? createWriteStream( output_path) : stdout

	print_messages( out, participants, archive )

	stderr.write('\nDone.\n')
}

// Convert list of participants to dictionary with keys both on id and name (if given)
// Input: [Name1:]id1,[Name2:]id2[, ...]

function to_participants( text: string ) : Participants
{
	var result : Participants = {};

	text.split(',').forEach( m => {
		const [k, v] = m.split(':')
		result[k] = v
		result[v] = k
	})

	return result
}

// Split option in option and value, if any:

function split_option( arg : string ) : [ string, string ]
{
	// ToDo: no '--option=value' used yet
	return [arg,'']
}

// Options:

interface Options
{
	help : boolean
	list_conversations: boolean
	list_user_information : boolean
}

// Split arguments in options and positional arguments:

function split_arguments( argv : string[] ) : [ Options, string[] ]
{
	// path to script:
	const prog = process.argv[1]

	var option : Options = { help:false, list_conversations:false, list_user_information:false }
	var position : string[] = []
	var in_options : boolean = true

	for ( const arg of argv )
	{
		if ( in_options )
		{
			const [opt, val] = split_option( arg )

			if      ( opt[0] != '-'  ) { in_options = false }
			else if ( opt    == '--' ) { in_options = false; continue  }
			else if ( opt    == '-h' || opt == '--help'                  ) { option.help = true; continue }
			else if ( opt    == '-l' || opt == '--list-conversations'    ) { option.list_conversations = true; continue }
			else if ( opt    == '-u' || opt == '--list-user-information' ) { option.list_user_information = true; continue }
			else { stderr.write(`\nUnrecognized option '${opt}', see '${prog} --help' for more information.\n\n`); exit(1) }
		}
		position.push(arg)
	}
	return [option, position]
}

// Main entry, handle commandline:

function main( argv : string[] )
{
	// commandline positional arguments: node script participants ziparchive [out_path]
	// argv[0]: node
	// argv[1]: script
	// argv[2]: path/to/ziparchive
	// argv[3]: participants: [p1-name:]p1-id,p2-name:p2-id[,p3...]
	// argv[4]: output path, defaults to stdout

	// path to script:
	const prog = process.argv[1]

	const [opt, pos] = split_arguments( argv.slice(2) )

	if ( opt.help )
	{
		exit( print_usage( stderr, 0 ) )
	}

	if ( pos.length < 1 )
	{
		stderr.write(`\nExpecting path/to/ziparchive, got none. See '${prog} --help' for more information.\n\n`)
		exit(1)
	}

	const ziparchive = pos[0]

	if ( opt.list_conversations || opt.list_user_information )
	{
		if ( opt.list_conversations )
			list_conversations( stdout, ziparchive )

		if ( opt.list_user_information )
			list_user_information( stdout, ziparchive )

		return
	}

	if ( pos.length < 2 )
	{
		stderr.write(`\nExpecting participants, got none. See '${prog} --help' for more information.\n\n`)
		exit(1)
	}

	if ( pos.length > 3 )
	{
		exit( print_usage( stderr, 1 ) )
	}

	const output       = pos[2] || ''
	const participants = to_participants( pos[1] )

	scrape_twitter_dm( participants, ziparchive, output )
}

// Execute script:

main( process.argv )
