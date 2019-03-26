package uhh_lt.newsleak.reader;

import java.io.File;
import java.io.FileReader;
import java.io.IOException;
import java.io.Reader;
import java.util.Iterator;

import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVRecord;
import org.apache.uima.UimaContext;
import org.apache.uima.cas.CAS;
import org.apache.uima.cas.CASException;
import org.apache.uima.collection.CollectionException;
import org.apache.uima.fit.descriptor.ConfigurationParameter;
import org.apache.uima.jcas.JCas;
import org.apache.uima.resource.ResourceInitializationException;
import org.apache.uima.util.Progress;
import org.apache.uima.util.ProgressImpl;

import uhh_lt.newsleak.types.Metadata;

/**
 * The Class NewsleakCsvStreamReader assumes externally generated Ids.
 */
public class NewsleakCsvStreamReader extends NewsleakReader {

	/** Directory containing input files. */
	public static final String PARAM_INPUTDIR = "inputDir";
	
	/** The input dir. */
	@ConfigurationParameter(name=PARAM_INPUTDIR, mandatory=false, defaultValue=".")
	private String inputDir;

	/** The Constant PARAM_DOCUMENT_FILE. */
	public static final String PARAM_DOCUMENT_FILE = "documentFile";
	
	/** The document file. */
	@ConfigurationParameter(name=PARAM_DOCUMENT_FILE, mandatory=true)
	private String documentFile;

	/** The Constant PARAM_METADATA_FILE. */
	public static final String PARAM_METADATA_FILE = "metadataFile";
	
	/** The metadata file. */
	@ConfigurationParameter(name=PARAM_METADATA_FILE, mandatory=true)
	private String metadataFile;

	/** The Constant PARAM_DEFAULT_LANG. */
	public static final String PARAM_DEFAULT_LANG = "defaultLanguage";
	
	/** The default language. */
	@ConfigurationParameter(name=PARAM_DEFAULT_LANG, mandatory=false, defaultValue="en")
	private String defaultLanguage;
	
	/** The Constant PARAM_DEBUG_MAX_DOCS. */
	public static final String PARAM_DEBUG_MAX_DOCS = "maxRecords";
	
	/** The max records. */
	@ConfigurationParameter(name=PARAM_DEBUG_MAX_DOCS, mandatory=false)
	private Integer maxRecords = Integer.MAX_VALUE;

	/** The csv reader. */
	private Reader csvReader;
	
	/** The records. */
	private Iterable<CSVRecord> records;
	
	/** The records iterator. */
	private Iterator<CSVRecord> recordsIterator;
	
//	private Reader metadataReader;
//	private Iterable<CSVRecord> metadata; 
//	private Iterator<CSVRecord> metadataIterator; 

	/** The total records. */
private int totalRecords = 0;
	
	/** The current record. */
	private int currentRecord = 0;

	/* (non-Javadoc)
	 * @see org.apache.uima.fit.component.CasCollectionReader_ImplBase#initialize(org.apache.uima.UimaContext)
	 */
	@Override
	public void initialize(UimaContext context) throws ResourceInitializationException {
		super.initialize(context);
		try {
			File csvFile = new File(inputDir, documentFile);
			csvReader = new FileReader(csvFile);
			records = CSVFormat.RFC4180.parse(csvReader);
			recordsIterator = records.iterator();
			
			// Process metadata file separately
//		    metadataReader = new FileReader(new File(inputDir, metadataFile));
//		    metadata = CSVFormat.RFC4180.parse(metadataReader);
//		    metadataIterator = metadata.iterator();
		} catch (IOException e) {
			throw new ResourceInitializationException(e);
		}
	}


	/* (non-Javadoc)
	 * @see org.apache.uima.collection.CollectionReader#getNext(org.apache.uima.cas.CAS)
	 */
	public void getNext(CAS cas) throws IOException, CollectionException {
		currentRecord++;
		JCas jcas;
		try {
			jcas = cas.getJCas();
		} catch (CASException e) {
			throw new CollectionException(e);
		}
		
		// Set document data
		CSVRecord record = recordsIterator.next();
		String docId = record.get(0); // external document id from CSV file
		
		jcas.setDocumentText(cleanBodyText(record.get(1)));
		jcas.setDocumentLanguage(record.size() > 3 ? record.get(3) : defaultLanguage);
		
		// Set metadata
		Metadata metaCas = new Metadata(jcas);
		metaCas.setDocId(docId);
		metaCas.setTimestamp(record.get(2));
		metaCas.addToIndexes();
		
		// metadata
		// is assumed to be provided from external prcessing in a separate file
		
	}


	/* (non-Javadoc)
	 * @see org.apache.uima.fit.component.CasCollectionReader_ImplBase#close()
	 */
	public void close() throws IOException {
		csvReader.close();
		// metadataReader.close();
	}

	/* (non-Javadoc)
	 * @see org.apache.uima.collection.base_cpm.BaseCollectionReader#getProgress()
	 */
	public Progress[] getProgress() {
		return new Progress[] {
				new ProgressImpl(
						Long.valueOf(currentRecord).intValue(),
						Long.valueOf(totalRecords).intValue(),
						Progress.ENTITIES
						)
		};
	}

	/* (non-Javadoc)
	 * @see org.apache.uima.collection.base_cpm.BaseCollectionReader#hasNext()
	 */
	public boolean hasNext() throws IOException, CollectionException {
		if (currentRecord > maxRecords) return false;
		return recordsIterator.hasNext();
	}

}
